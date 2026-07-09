export interface StructuralNode {
  nodeId: string;
  kind: string;
  name: string;
  qualifiedName: string;
  filePath: string;
  properties: Record<string, unknown>;
}

export interface StructuralEdge {
  sourceId: string;
  targetId: string;
  kind: string;
  properties?: Record<string, unknown>;
}

export interface RegionResult {
  kind: 'region';
  roots: string[];
  nodes: StructuralNode[];
  edges: StructuralEdge[];
  distance: Record<string, number>;
}

export interface PathResult {
  kind: 'path';
  paths: Array<{
    nodes: string[];
    edges: StructuralEdge[];
    cost?: number;
  }>;
}

export interface ImpactResult {
  kind: 'impact';
  root: string;
  affected: Array<{
    nodeId: string;
    depth: number;
    via: string;
  }>;
  edges: StructuralEdge[];
}

export type ExecutionResult = RegionResult | PathResult | ImpactResult;
