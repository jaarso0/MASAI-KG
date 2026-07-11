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
    truncatedForSize?: boolean;
  };
}

// Absolute ceiling on serialized output, enforced after all budgeting. The per-node budget
// allocator only bounds node *source* representation — it does not count the Anchors and
// Relationships sections, which can themselves be large on a hub symbol. This is the final
// hard guarantee that a single tool call never returns something that blows past a client's
// token limit (~40K chars ≈ 10K tokens, comfortably under typical MCP response limits).
const HARD_OUTPUT_CHAR_CAP = 40000;

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
      const region = structuralResult as RegionResult;
      serializedContext = serializeRegion(evidence, region.roots, levels, region.omittedEdgeCount || 0);
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

    // 4. Hard size backstop — clamp the fully-serialized output as a last resort, so a
    // pathological hub query can never exceed the client's response limit regardless of
    // how the per-node budgeter allocated. This should rarely fire now that the budgeter
    // counts real body size, but it guarantees the tool degrades gracefully instead of failing.
    let truncatedForSize = false;
    if (serializedContext.length > HARD_OUTPUT_CHAR_CAP) {
      serializedContext =
        serializedContext.slice(0, HARD_OUTPUT_CHAR_CAP) +
        `\n\n... [output truncated at ${HARD_OUTPUT_CHAR_CAP} characters to stay within response limits. ` +
        `Narrow the query with a smaller depth, a single direction, or edgeKinds to see the rest.]`;
      truncatedForSize = true;
    }

    // 5. Calculate final stats
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
        truncatedNodes: truncatedCount,
        truncatedForSize
      }
    };
  }
}
