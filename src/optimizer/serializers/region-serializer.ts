import { MaterializedEvidence, MaterializedNode } from '../../evidence/types.js';
import { RepresentationLevel } from '../budget-allocator.js';

export function serializeRegion(
  evidence: MaterializedEvidence,
  roots: string[],
  levels: Map<string, RepresentationLevel>
): string {
  const nodeMap = new Map<string, MaterializedNode>(evidence.nodes.map(n => [n.nodeId, n]));

  let output = '=== NEIGHBORHOOD REGION EXPORT ===\n\n';

  // 1. List Anchors
  output += 'Anchors:\n';
  roots.forEach(rootId => {
    const node = nodeMap.get(rootId);
    if (node) {
      output += `- ${node.qualifiedName} (${node.kind}) [ID: ${node.nodeId}]\n`;
      output += `  File: ${node.file}\n`;
      if (node.signature) output += `  Signature: ${node.signature}\n`;
      if (node.docs) output += `  Docs:\n${node.docs.split('\n').map(l => '    ' + l).join('\n')}\n`;
    } else {
      output += `- [Unresolved Anchor ID: ${rootId}]\n`;
    }
  });
  output += '\n';

  // 2. Incoming and Outgoing Edges summary
  output += 'Relationships:\n';
  evidence.edges.forEach(edge => {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    const srcName = src ? src.qualifiedName : edge.source;
    const tgtName = tgt ? tgt.qualifiedName : edge.target;
    output += `- ${srcName} --[${edge.kind}]--> ${tgtName}\n`;
    if (edge.callsite) {
      output += `  Callsite: ${edge.callsite.file}:${edge.callsite.line} -> "${edge.callsite.snippet}"\n`;
    }
  });
  output += '\n';

  // 3. Supporting Source Spans
  const codeNodes = evidence.nodes.filter(n => {
    const lvl = levels.get(n.nodeId) || 'SIGNATURE';
    return lvl === 'FULL' || lvl === 'SNIPPET';
  });

  if (codeNodes.length > 0) {
    output += 'Supporting Source Spans:\n\n';
    codeNodes.forEach(node => {
      const lvl = levels.get(node.nodeId)!;
      output += `File: ${node.file} | Node: ${node.qualifiedName} (${lvl})\n`;
      output += `--------------------------------------------------\n`;
      if (node.source) {
        if (lvl === 'SNIPPET') {
          // Crop source to first 25 lines
          const cropLines = node.source.text.split('\n').slice(0, 25);
          output += cropLines.join('\n');
          if (node.source.text.split('\n').length > 25) {
            output += '\n... [Snippet Truncated due to Token Budget] ...';
          }
        } else {
          output += node.source.text;
        }
      } else {
        output += `[Code unavailable]`;
      }
      output += `\n--------------------------------------------------\n\n`;
    });
  }

  return output.trim();
}
