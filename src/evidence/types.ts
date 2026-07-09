export interface MaterializedNode {
  nodeId: string;
  name: string;
  qualifiedName: string;
  kind: string;
  file: string;
  signature?: string;
  source?: {
    startLine: number;
    endLine: number;
    text: string;
  };
  docs?: string;
  structuralRole: 'anchor' | 'path' | 'direct_neighbor' | 'transitive_neighbor' | 'impacted';
}

export interface MaterializedEdge {
  source: string;
  target: string;
  kind: string;
  callsite?: {
    file: string;
    line: number;
    snippet: string;
  };
}

export interface MaterializedEvidence {
  nodes: MaterializedNode[];
  edges: MaterializedEdge[];
}
