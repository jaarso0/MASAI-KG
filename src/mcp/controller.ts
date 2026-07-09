import { KnowledgeGraph } from '../stage5-graph/graph.js';
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
    maxPaths: 20
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
    const resolution = this.resolver.resolveAll(plan.anchors);
    
    if (resolution.status === 'not_found') {
      return {
        status: 'not_found',
        message: `Could not resolve anchor query: ${resolution.missingQueries.join(', ')}`,
        missingQueries: resolution.missingQueries
      };
    }

    if (resolution.status === 'ambiguous') {
      const isSearch = plan.operation === 'region' && plan.constraints?.requestedDepth === 0;
      if (isSearch) {
        const candidates = resolution.ambiguousAnchors.flatMap(a => a.candidates);
        return {
          status: 'success',
          operation: 'search',
          candidates
        };
      }

      // Return candidates immediately to Host LLM without executing traversal
      return {
        status: 'ambiguous',
        message: 'One or more anchor queries resolved to multiple candidates. Please refine your query.',
        ambiguousAnchors: resolution.ambiguousAnchors
      };
    }

    // 2. Traversal Phase (Safe Graph Executor)
    const resolvedAnchors = resolution.anchors.map(a => a.nodeId);
    const planWithResolved = { ...plan, resolvedAnchors };

    const structuralResult = this.executor.execute(planWithResolved, {
      maxDepth: DEFAULT_POLICY.graph.maxDepth,
      maxNodes: DEFAULT_POLICY.graph.maxNodes,
      maxPaths: DEFAULT_POLICY.graph.maxPaths
    });

    // 3. Evidence Materialization Phase (Batch File Reader & Slicer)
    // Clear materializer cache per-request for fresh file content
    this.materializer.clearCache();
    const evidence = await this.materializer.materialize(structuralResult, plan);

    // 4. Context Optimization & Serialization Phase
    const contextPackage = await this.optimizer.optimize(plan, structuralResult, evidence);

    const durationMs = Date.now() - startTime;
    console.error(`Request execution completed in ${durationMs}ms`);

    return {
      status: 'success',
      ...contextPackage
    };
  }
}
