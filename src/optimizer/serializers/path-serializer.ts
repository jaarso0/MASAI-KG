import { MaterializedEvidence, MaterializedNode, MaterializedEdge } from '../../evidence/types.js';
import { RepresentationLevel } from '../budget-allocator.js';

export function serializePath(
  evidence: MaterializedEvidence,
  paths: Array<{ nodes: string[]; edges: any[] }>,
  levels: Map<string, RepresentationLevel>
): string {
  if (paths.length === 0) {
    return 'No call paths found between the specified anchors.';
  }

  const nodeMap = new Map<string, MaterializedNode>(evidence.nodes.map(n => [n.nodeId, n]));
  const edgeMap = new Map<string, MaterializedEdge>();
  
  for (const e of evidence.edges) {
    edgeMap.set(`${e.source}->${e.target}:${e.kind}`, e);
    // Also fallback index by source and target
    edgeMap.set(`${e.source}->${e.target}`, e);
  }

  let output = '=== PATH FINDING RESULT ===\n\n';

  paths.forEach((pathObj, pathIdx) => {
    output += `Path ${pathIdx + 1}:\n`;
    
    pathObj.nodes.forEach((nodeId, idx) => {
      const node = nodeMap.get(nodeId);
      const lvl = levels.get(nodeId) || 'SIGNATURE';

      if (!node || lvl === 'OMIT') {
        output += `  [Omitted: ${nodeId}]\n`;
      } else {
        output += `  ${node.qualifiedName} (${node.kind}) [Role: ${node.structuralRole}]\n`;
        output += `    File: ${node.file}\n`;
        if (node.signature && lvl !== 'OMIT') {
          output += `    Signature: ${node.signature}\n`;
        }
      }

      // If there is a next hop, print the edge relationship and callsite
      if (idx < pathObj.nodes.length - 1) {
        const nextNodeId = pathObj.nodes[idx + 1];
        const edge = edgeMap.get(`${nodeId}->${nextNodeId}`) || edgeMap.get(`${nodeId}->${nextNodeId}:call`);
        
        output += `         ↓\n`;
        if (edge) {
          output += `         [${edge.kind.toUpperCase()}]`;
          if (edge.callsite) {
            output += ` at ${edge.callsite.file}:${edge.callsite.line} -> "${edge.callsite.snippet}"`;
          }
          output += `\n         ↓\n`;
        } else {
          output += `         ↓ [RELATION]\n         ↓\n`;
        }
      }
    });
    output += '\n--------------------------------------------------\n\n';
  });

  return output.trim();
}
