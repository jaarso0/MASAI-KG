import { MaterializedEvidence } from '../evidence/types.js';
import { GraphQueryPlan } from '../mcp/types.js';
import { RegionResult, PathResult, ImpactResult } from '../executor/result-types.js';
import { allocateBudget, estimateTokens, RepresentationLevel } from './budget-allocator.js';
import { mergeSpans, LineSpan } from './span-merger.js';
import { serializePath } from './serializers/path-serializer.js';
import { serializeRegion } from './serializers/region-serializer.js';
import { serializeImpact } from './serializers/impact-serializer.js';

export interface ContextPackage {
  operation: string;
  serializedContext: string;
  tokenUsage: {
    estimated: number;
    budget: number;
  };
  omissions: {
    omittedNodes: number;
    truncatedNodes: number;
  };
}

export class QueryContextOptimizer {
  private fileLinesLoader: (filePath: string) => Promise<string[] | null>;

  constructor(fileLinesLoader: (filePath: string) => Promise<string[] | null>) {
    this.fileLinesLoader = fileLinesLoader;
  }

  /**
   * Optimizes evidence to fit inside token budgets, merges overlapping spans, and serializes the result.
   */
  public async optimize(
    plan: GraphQueryPlan,
    structuralResult: RegionResult | PathResult | ImpactResult,
    evidence: MaterializedEvidence
  ): Promise<ContextPackage> {
    const tokenBudget = plan.context?.tokenBudget || 8000;

    // 1. Allocate representation levels based on role priority and budget
    const levels = allocateBudget(evidence.nodes, tokenBudget);

    // 2. Perform span merging on the code segments of nodes set to FULL or SNIPPET
    const updatedNodes = [...evidence.nodes];
    const nodesByFile = new Map<string, typeof updatedNodes>();

    for (const node of updatedNodes) {
      const lvl = levels.get(node.nodeId) || 'SIGNATURE';
      if ((lvl === 'FULL' || lvl === 'SNIPPET') && node.source) {
        const list = nodesByFile.get(node.file) || [];
        list.push(node);
        nodesByFile.set(node.file, list);
      }
    }

    for (const [file, fileNodes] of nodesByFile.entries()) {
      const fileLines = await this.fileLinesLoader(file);
      if (!fileLines) continue;

      const spans: LineSpan[] = fileNodes.map(n => ({
        startLine: n.source!.startLine,
        endLine: n.source!.endLine,
        text: n.source!.text
      }));

      // Merge overlapping or close spans
      const mergedSpans = mergeSpans(spans, fileLines);

      // Map nodes back to their merged spans
      for (const n of fileNodes) {
        const nStart = n.source!.startLine;
        const nEnd = n.source!.endLine;

        // Find which merged span covers this node's range
        const matchingMerged = mergedSpans.find(
          m => nStart >= m.startLine && nEnd <= m.endLine
        );

        if (matchingMerged) {
          n.source = {
            startLine: matchingMerged.startLine,
            endLine: matchingMerged.endLine,
            text: matchingMerged.text
          };
        }
      }
    }

    // 3. Serialize based on operation type
    let serializedContext = '';
    if (structuralResult.kind === 'region') {
      serializedContext = serializeRegion(evidence, (structuralResult as RegionResult).roots, levels);
    } else if (structuralResult.kind === 'path') {
      serializedContext = serializePath(evidence, (structuralResult as PathResult).paths, levels);
    } else if (structuralResult.kind === 'impact') {
      serializedContext = serializeImpact(
        evidence,
        (structuralResult as ImpactResult).root,
        (structuralResult as ImpactResult).affected,
        levels
      );
    }

    // 4. Calculate final stats
    let omittedCount = 0;
    let truncatedCount = 0;
    for (const [_, lvl] of levels.entries()) {
      if (lvl === 'OMIT') omittedCount++;
      if (lvl === 'SNIPPET') truncatedCount++;
    }

    const estimatedTokens = estimateTokens(serializedContext);

    return {
      operation: plan.operation,
      serializedContext,
      tokenUsage: {
        estimated: estimatedTokens,
        budget: tokenBudget
      },
      omissions: {
        omittedNodes: omittedCount,
        truncatedNodes: truncatedCount
      }
    };
  }
}
