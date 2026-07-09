import { KnowledgeGraph, KGNode, KGEdge } from '../../stage5-graph/graph.js';
import { RegionResult, StructuralNode, StructuralEdge } from '../result-types.js';

export function executeRegion(
  graph: KnowledgeGraph,
  options: {
    anchors: string[];
    direction: 'incoming' | 'outgoing' | 'both';
    edgeKinds?: string[];
    depth: number;
    nodeLimit: number;
  }
): RegionResult {
  const { anchors, direction, edgeKinds, depth, nodeLimit } = options;
  
  const distance: Record<string, number> = {};
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  
  const resultNodesMap = new Map<string, KGNode>();
  const resultEdges: KGEdge[] = [];

  // Initialize anchors
  const queue: Array<{ id: string; d: number }> = [];
  for (const anchorId of anchors) {
    const node = graph.getNode(anchorId);
    if (node) {
      visitedNodes.add(anchorId);
      distance[anchorId] = 0;
      resultNodesMap.set(anchorId, node);
      queue.push({ id: anchorId, d: 0 });
    }
  }

  // BFS Traversal
  while (queue.length > 0) {
    const { id, d } = queue.shift()!;

    if (d >= depth) continue;

    // Retrieve relevant edges based on direction
    const outgoing = (direction === 'outgoing' || direction === 'both') ? graph.getEdgesFrom(id) : [];
    const incoming = (direction === 'incoming' || direction === 'both') ? graph.getEdgesTo(id) : [];
    const allEdges = [...outgoing, ...incoming];

    for (const edge of allEdges) {
      // Check edge kind matches filter (case-insensitive & plural-insensitive)
      const isAllowedKind = !edgeKinds || edgeKinds.length === 0 || edgeKinds.some(k => {
        const queryKind = k.toLowerCase().replace(/s$/, '');
        const actualKind = edge.kind.toLowerCase().replace(/s$/, '');
        return queryKind === actualKind;
      });

      if (!isAllowedKind) continue;

      const edgeKey = `${edge.sourceId}->${edge.targetId}:${edge.kind}`;
      if (visitedEdges.has(edgeKey)) continue;
      visitedEdges.add(edgeKey);

      const neighborId = edge.sourceId === id ? edge.targetId : edge.sourceId;
      const neighborNode = graph.getNode(neighborId);

      if (!neighborNode) continue;

      const isNeighborVisited = visitedNodes.has(neighborId);

      if (!isNeighborVisited) {
        // Enforce hard node ceiling
        if (resultNodesMap.size >= nodeLimit) continue;

        visitedNodes.add(neighborId);
        distance[neighborId] = d + 1;
        resultNodesMap.set(neighborId, neighborNode);
        queue.push({ id: neighborId, d: d + 1 });
      }

      // Record the edge (provenance)
      resultEdges.push(edge);
    }
  }

  // Map to structural types
  const nodes: StructuralNode[] = Array.from(resultNodesMap.values()).map(n => ({
    nodeId: n.id,
    kind: n.kind,
    name: n.name,
    qualifiedName: n.qualifiedName,
    filePath: n.filePath,
    properties: n.properties
  }));

  const edges: StructuralEdge[] = resultEdges.map(e => ({
    sourceId: e.sourceId,
    targetId: e.targetId,
    kind: e.kind,
    properties: e.resolutionMethod ? { resolutionMethod: e.resolutionMethod } : undefined
  }));

  return {
    kind: 'region',
    roots: anchors,
    nodes,
    edges,
    distance
  };
}
