import { MaterializedEvidence, MaterializedNode, MaterializedEdge } from '../../evidence/types.js';
import { RepresentationLevel } from '../budget-allocator.js';
import { getDisplayName, serializeNavigationPackage, formatResolutionConfidence, formatUnresolvedRefs, formatTestCoverage, formatConfidenceSummary } from './helper.js';

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
    edgeMap.set(`${e.source}->${e.target}`, e);
  }

  let output = '=== PATH FINDING RESULT ===\n\n';

  const pathReferenceEdges = evidence.edges.filter(e => e.resolutionMethod !== undefined);
  const summary = formatConfidenceSummary(pathReferenceEdges, 'reference edge(s) across all path(s)');
  if (summary) output += summary + '\n';

  paths.forEach((pathObj, pathIdx) => {
    output += `Path ${pathIdx + 1}:\n`;

    const printedEdges = new Set<string>();
    pathObj.nodes.forEach((nodeId, idx) => {
      const node = nodeMap.get(nodeId);
      const lvl = levels.get(nodeId) || 'SIGNATURE';

      if (!node || lvl === 'OMIT') {
        output += `  [Omitted: ${nodeId}]\n`;
      } else {
        const displayName = getDisplayName(node, nodeId);
        output += `  ${displayName} (${node.kind}) [Role: ${node.structuralRole}]\n`;
        output += `    File: ${node.file}\n`;
        if (node.signature && lvl !== 'OMIT') {
          output += `    Signature: ${node.signature}\n`;
        }
        const unresolvedNote = formatUnresolvedRefs(node);
        if (unresolvedNote) output += '  ' + unresolvedNote;
        const testNote = formatTestCoverage(node);
        if (testNote) output += '  ' + testNote;
      }

      // Print relationship with callsites
      if (idx < pathObj.nodes.length - 1) {
        const nextNodeId = pathObj.nodes[idx + 1];
        const edge = edgeMap.get(`${nodeId}->${nextNodeId}`) || edgeMap.get(`${nodeId}->${nextNodeId}:call`);

        // Prevent duplicate path link printing
        const edgeKey = `${nodeId}->${nextNodeId}:${edge?.kind || 'relation'}:${edge?.callsite?.line || ''}`;
        if (printedEdges.has(edgeKey)) {
          output += `         ↓\n         ↓\n`;
          return;
        }
        printedEdges.add(edgeKey);

        output += `         ↓\n`;
        if (edge) {
          output += `         [${edge.kind.toUpperCase()}]${formatResolutionConfidence(edge.resolutionMethod)}`;
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

  // Recommended Code Ranges to Read Next
  const spansOutput = serializeNavigationPackage(evidence.nodes, levels);
  if (spansOutput) {
    output += spansOutput;
  }

  return output.trim();
}
