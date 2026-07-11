import { KnowledgeGraph } from '../graph/graph.js';
import { GraphQueryPlan } from './types.js';
import { AnchorResolver } from '../resolution/anchor-resolver.js';
import { GraphExecutor } from '../executor/graph-executor.js';
import { EvidenceMaterializer } from '../evidence/materializer.js';
import { QueryContextOptimizer } from '../optimizer/query-context-optimizer.js';

export interface RequestPolicy {
  maxResolutionAttempts: number;
  timeoutMs: number;
  graph: {
    maxDepth: number;
    maxNodes: number;
    maxPaths: number;
    maxEdges: number;
  };
  context: {
    maxTokens: number;
  };
}

export const DEFAULT_POLICY: RequestPolicy = {
  maxResolutionAttempts: 2,
  timeoutMs: 5000,
  graph: {
    maxDepth: 6,
    maxNodes: 200,
    maxPaths: 20,
    // Proactive ceiling on edges surfaced from a region traversal, enforced in the
    // executor before materialization. Ranked by relevance, so a hub query keeps the
    // edges worth showing and never pays to materialize thousands it would discard.
    maxEdges: 120
  },
  context: {
    maxTokens: 12000
  }
};

export class RequestController {
  private graph: KnowledgeGraph;
  private projectRoot: string;
  private resolver: AnchorResolver;
  private executor: GraphExecutor;
  private materializer: EvidenceMaterializer;
  private optimizer: QueryContextOptimizer;

  constructor(graph: KnowledgeGraph, projectRoot: string) {
    this.graph = graph;
    this.projectRoot = projectRoot;
    this.resolver = new AnchorResolver(graph);
    this.executor = new GraphExecutor(graph);
    this.materializer = new EvidenceMaterializer(graph, projectRoot);

    // Bind materializer's file line loader to the optimizer
    this.optimizer = new QueryContextOptimizer(
      async (filePath: string) => {
        // Access loadFileLines using internal method or expose it on materializer
        // Since we are in the same module ecosystem, we can cast/use a helper.
        // Let's call the loader on materializer.
        return (this.materializer as any).loadFileLines(filePath);
      }
    );
  }

  /**
   * Processes a GraphQueryPlan end-to-end.
   * If there is ambiguity or search failures, returns resolution result immediately.
   */
  public async processPlan(plan: GraphQueryPlan): Promise<any> {
    const startTime = Date.now();

    // 1. Anchor Resolution Phase
    // search_symbols wants the raw candidate list on ambiguity; traversal tools
    // (explore/trace/impact) auto-pick the best match and proceed, so a loose or
    // natural-language query resolves in a single call instead of forcing a
    // search-then-copy-nodeId round-trip.
    const isSearch = plan.operation === 'region' && plan.constraints?.searchMode === true;
    const resolution = this.resolver.resolveAll(plan.anchors, { autoPick: !isSearch });

    if (resolution.status === 'not_found') {
      return {
        status: 'not_found',
        message: `Could not resolve anchor query: ${resolution.missingQueries.join(', ')}`,
        missingQueries: resolution.missingQueries
      };
    }

    if (resolution.status === 'ambiguous') {
      if (isSearch) {
        const candidates = resolution.ambiguousAnchors.flatMap(a => a.candidates);
        return {
          status: 'success',
          operation: 'search',
          candidates
        };
      }

      // Only reached when autoPick had candidates but none mapped to a live graph node.
      return {
        status: 'ambiguous',
        message: 'One or more anchor queries resolved to multiple candidates. Please refine your query.',
        ambiguousAnchors: resolution.ambiguousAnchors
      };
    }

    const disambiguations = resolution.disambiguations;

    // 2. Traversal Phase (Safe Graph Executor)
    const resolvedAnchors = resolution.anchors.map(a => a.nodeId);
    const planWithResolved = { ...plan, resolvedAnchors };

    const structuralResult = this.executor.execute(planWithResolved, {
      maxDepth: DEFAULT_POLICY.graph.maxDepth,
      maxNodes: DEFAULT_POLICY.graph.maxNodes,
      maxPaths: DEFAULT_POLICY.graph.maxPaths,
      maxEdges: DEFAULT_POLICY.graph.maxEdges
    });

    // 3. Evidence Materialization Phase (Batch File Reader & Slicer)
    // Clear materializer cache per-request for fresh file content
    this.materializer.clearCache();
    const evidence = await this.materializer.materialize(structuralResult, plan);

    // 4. Context Optimization & Serialization Phase
    const contextPackage = await this.optimizer.optimize(plan, structuralResult, evidence);

    // Prepend a transparency note when a loose query was auto-resolved, so the caller
    // knows which symbol it landed on and how to redirect if it guessed wrong.
    if (disambiguations && disambiguations.length > 0) {
      const noteLines = disambiguations.map(d => {
        const alts = d.alternatives.length > 0
          ? ` — also matched: ${d.alternatives.map(a => a.qualifiedName || a.nodeId).join(', ')}. Pass an exact ID to pick another.`
          : '';
        return `- "${d.query}" → ${d.chosen.qualifiedName} [${d.chosen.nodeId}]${alts}`;
      });
      contextPackage.serializedContext =
        `Note: auto-resolved ambiguous anchor(s) to the best match:\n${noteLines.join('\n')}\n\n` +
        contextPackage.serializedContext;
    }

    const durationMs = Date.now() - startTime;
    console.error(`Request execution completed in ${durationMs}ms`);

    return {
      status: 'success',
      ...contextPackage
    };
  }
}
