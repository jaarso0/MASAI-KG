import { BaseRetriever } from './base.js';
import { KGNode, KGEdge } from '../../graph/graph.js';
import { GraphExpander } from '../expander.js';

export class LocateRetriever extends BaseRetriever {
  public retrieve(candidates: KGNode[], taskQuery: string): { nodes: KGNode[]; edges: KGEdge[] } {
    const expander = new GraphExpander(this.graph);
    const candidateIds = candidates.map(c => c.id);

    // Locate Strategy focuses on: Imports, Inherits, Implements and containment hierarchies (parent/child)
    return expander.expand(candidateIds, {
      maxDepth: 1,
      relationTypes: ['import', 'inherit', 'implement'],
      includeContainment: true,
      maxNodes: 50
    });
  }
}
