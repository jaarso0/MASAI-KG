import { BaseRetriever } from './base.js';
import { KGNode, KGEdge } from '../../graph/graph.js';
import { GraphExpander } from '../expander.js';

export class FlowRetriever extends BaseRetriever {
  public retrieve(candidates: KGNode[], taskQuery: string): { nodes: KGNode[]; edges: KGEdge[] } {
    const expander = new GraphExpander(this.graph);
    const candidateIds = candidates.map(c => c.id);

    // Flow Strategy: Traverses call chains and instantiations forward up to depth 3
    return expander.expand(candidateIds, {
      maxDepth: 3,
      relationTypes: ['call', 'instantiate'],
      includeContainment: false,
      maxNodes: 70
    });
  }
}
