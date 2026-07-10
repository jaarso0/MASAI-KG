export interface MaterializedNode {
  nodeId: string;
  name: string;
  qualifiedName: string;
  kind: string;
  file: string;
  signature?: string;
  range?: {
    startLine: number;
    endLine: number;
  };
  source?: {
    startLine: number;
    endLine: number;
    text: string;
  };
  docs?: string;
  structuralRole: 'anchor' | 'path' | 'direct_neighbor' | 'transitive_neighbor' | 'impacted';
  unresolvedRefs?: { rawName: string; kind: string }[];
  /** undefined = not a testable kind (file/variable/etc); true/false = whether any test file references it */
  hasCoveringTests?: boolean;
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
  resolutionMethod?: string;
}

export interface MaterializedEvidence {
  nodes: MaterializedNode[];
  edges: MaterializedEdge[];
}
