import { RetrievalIndexes } from '../indexes.js';
import { KnowledgeGraph, KGNode, KGEdge } from '../../stage5-graph/graph.js';

export abstract class BaseRetriever {
  protected indexes: RetrievalIndexes;
  protected graph: KnowledgeGraph;

  constructor(indexes: RetrievalIndexes, graph: KnowledgeGraph) {
    this.indexes = indexes;
    this.graph = graph;
  }

  abstract retrieve(candidates: KGNode[], taskQuery: string): { nodes: KGNode[]; edges: KGEdge[] };
}
