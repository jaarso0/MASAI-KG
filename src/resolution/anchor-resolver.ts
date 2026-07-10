import { KnowledgeGraph, KGNode } from '../graph/graph.js';
import { CandidateDiscovery } from '../retrieval/discovery.js';
import { RetrievalIndexes } from '../retrieval/indexes.js';
import { AnchorSpec } from '../mcp/types.js';
import { ResolvedAnchor, AnchorCandidate, ResolutionResult, MultiAnchorResolutionResult } from './types.js';

export class AnchorResolver {
  private graph: KnowledgeGraph;
  private indexes: RetrievalIndexes;
  private discovery: CandidateDiscovery;

  constructor(graph: KnowledgeGraph) {
    this.graph = graph;
    this.indexes = new RetrievalIndexes(graph);
    this.discovery = new CandidateDiscovery(this.indexes);
  }

  /**
   * Resolves a single anchor spec.
   */
  public resolveAnchor(spec: AnchorSpec): ResolutionResult {
    const query = spec.query.trim();
    const kindFilter = spec.kind;
    const resolutionMode = spec.resolution || 'auto';

    console.error(`Resolving anchor: "${query}" (kind: ${kindFilter || 'any'}, mode: ${resolutionMode})`);

    // 1. Stable Node ID Lookup (only if mode is 'exact' or 'auto')
    if (resolutionMode === 'exact' || resolutionMode === 'auto') {
      const node = this.graph.getNode(query);
      if (node && (!kindFilter || node.kind === kindFilter)) {
        console.error(`-> Exact ID match found: ${node.id}`);
        return {
          status: 'resolved',
          anchors: [this.mapNodeToResolved(node)]
        };
      }
    }

    // 2. Case-insensitive Qualified Name Match
    if (resolutionMode === 'exact' || resolutionMode === 'auto') {
      const lowerQuery = query.toLowerCase();
      const qnameMatches = this.graph.getAllNodes().filter(n =>
        n.qualifiedName.toLowerCase() === lowerQuery &&
        (!kindFilter || n.kind === kindFilter)
      );

      if (qnameMatches.length === 1) {
        console.error(`-> Single Qualified Name match: ${qnameMatches[0].id}`);
        return {
          status: 'resolved',
          anchors: [this.mapNodeToResolved(qnameMatches[0])]
        };
      } else if (qnameMatches.length > 1) {
        console.error(`-> Ambiguous Qualified Name match: ${qnameMatches.length} candidates`);
        return {
          status: 'ambiguous',
          candidates: qnameMatches.map(n => this.mapNodeToCandidate(n))
        };
      }
    }

    // 3. Case-insensitive Symbol Name Match
    if (resolutionMode === 'exact' || resolutionMode === 'auto') {
      const lowerQuery = query.toLowerCase();
      const nameMatches = this.graph.getAllNodes().filter(n =>
        n.name.toLowerCase() === lowerQuery &&
        (!kindFilter || n.kind === kindFilter)
      );

      if (nameMatches.length === 1) {
        console.error(`-> Single Symbol Name match: ${nameMatches[0].id}`);
        return {
          status: 'resolved',
          anchors: [this.mapNodeToResolved(nameMatches[0])]
        };
      } else if (nameMatches.length > 1) {
        console.error(`-> Ambiguous Symbol Name match: ${nameMatches.length} candidates`);
        return {
          status: 'ambiguous',
          candidates: nameMatches.map(n => this.mapNodeToCandidate(n))
        };
      }
    }

    // 4. Token FTS / Discovery Search (only if mode is 'search' or 'auto')
    if (resolutionMode === 'search' || resolutionMode === 'auto') {
      const discovered = this.discovery.discover(query, 20);
      let candidates = discovered.map(d => ({
        ...this.mapNodeToCandidate(d.node),
        score: d.score,
        matchReasons: d.matchReasons
      }));

      if (kindFilter) {
        candidates = candidates.filter(c => {
          const node = this.graph.getNode(c.nodeId);
          return node && node.kind === kindFilter;
        });
      }

      if (candidates.length === 1) {
        console.error(`-> Single FTS match found: ${candidates[0].nodeId} (score: ${candidates[0].score})`);
        const node = this.graph.getNode(candidates[0].nodeId)!;
        return {
          status: 'resolved',
          anchors: [this.mapNodeToResolved(node)]
        };
      } else if (candidates.length > 1) {
        console.error(`-> Ambiguous FTS match: ${candidates.length} candidates`);
        return {
          status: 'ambiguous',
          candidates
        };
      }
    }

    console.error(`-> Anchor not found for query: "${query}"`);
    return {
      status: 'not_found',
      query
    };
  }

  /**
   * Resolves multiple anchor specs.
   * If any anchor resolves to ambiguous or not_found, returns a structured error.
   */
  public resolveAll(specs: AnchorSpec[]): MultiAnchorResolutionResult {
    const resolvedAnchors: ResolvedAnchor[] = [];
    const ambiguousAnchors: Array<{ query: string; candidates: AnchorCandidate[] }> = [];
    const missingQueries: string[] = [];

    for (const spec of specs) {
      const result = this.resolveAnchor(spec);
      if (result.status === 'resolved') {
        resolvedAnchors.push(...result.anchors);
      } else if (result.status === 'ambiguous') {
        ambiguousAnchors.push({
          query: spec.query,
          candidates: result.candidates
        });
      } else if (result.status === 'not_found') {
        missingQueries.push(result.query);
      }
    }

    if (missingQueries.length > 0) {
      return {
        status: 'not_found',
        missingQueries
      };
    }

    if (ambiguousAnchors.length > 0) {
      return {
        status: 'ambiguous',
        ambiguousAnchors
      };
    }

    return {
      status: 'resolved',
      anchors: resolvedAnchors
    };
  }

  private mapNodeToResolved(node: KGNode): ResolvedAnchor {
    return {
      nodeId: node.id,
      name: node.name,
      qualifiedName: node.qualifiedName,
      file: node.filePath
    };
  }

  private mapNodeToCandidate(node: KGNode): AnchorCandidate {
    return {
      nodeId: node.id,
      name: node.name,
      qualifiedName: node.qualifiedName,
      file: node.filePath
    };
  }
}
