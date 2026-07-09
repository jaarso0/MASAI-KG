import { MaterializedEvidence, MaterializedNode } from '../../evidence/types.js';
import { RepresentationLevel } from '../budget-allocator.js';

export function serializeImpact(
  evidence: MaterializedEvidence,
  rootId: string,
  affected: Array<{ nodeId: string; depth: number; via: string }>,
  levels: Map<string, RepresentationLevel>
): string {
  const nodeMap = new Map<string, MaterializedNode>(evidence.nodes.map(n => [n.nodeId, n]));
  const rootNode = nodeMap.get(rootId);

  let output = '=== DEPENDENCY IMPACT CONE ===\n\n';

  // 1. Root symbol (where change was made)
  if (rootNode) {
    output += `Changed Symbol: ${rootNode.qualifiedName} (${rootNode.kind})\n`;
    output += `File: ${rootNode.file}\n`;
    if (rootNode.signature) output += `Signature: ${rootNode.signature}\n`;
    if (rootNode.docs) output += `Docs:\n${rootNode.docs.split('\n').map(l => '  ' + l).join('\n')}\n`;
  } else {
    output += `Changed Symbol ID: ${rootId}\n`;
  }
  output += '\n--------------------------------------------------\n\n';

  if (affected.length === 0) {
    output += 'No downstream dependents or affected symbols were found.\n';
    return output.trim();
  }

  // 2. Group affected nodes by depth
  const byDepth = new Map<number, Array<{ nodeId: string; via: string }>>();
  affected.forEach(a => {
    const list = byDepth.get(a.depth) || [];
    list.push({ nodeId: a.nodeId, via: a.via });
    byDepth.set(a.depth, list);
  });

  const sortedDepths = Array.from(byDepth.keys()).sort((a, b) => a - b);

  sortedDepths.forEach(depth => {
    const title = depth === 1 ? 'Direct Dependents (Depth 1):' : `Transitive Dependents (Depth ${depth}):`;
    output += `${title}\n`;
    
    const items = byDepth.get(depth)!;
    items.forEach(item => {
      const node = nodeMap.get(item.nodeId);
      if (node) {
        output += `- ${node.qualifiedName} (${node.kind}) [via: ${item.via}]\n`;
        output += `  File: ${node.file}\n`;
      } else {
        output += `- [ID: ${item.nodeId}] [via: ${item.via}]\n`;
      }
    });
    output += '\n';
  });

  // 3. Supporting Source Spans
  const codeNodes = evidence.nodes.filter(n => {
    const lvl = levels.get(n.nodeId) || 'SIGNATURE';
    return n.nodeId !== rootId && (lvl === 'FULL' || lvl === 'SNIPPET');
  });

  if (codeNodes.length > 0) {
    output += 'Supporting Source Spans of Dependents:\n\n';
    codeNodes.forEach(node => {
      const lvl = levels.get(node.nodeId)!;
      output += `File: ${node.file} | Node: ${node.qualifiedName} (${lvl})\n`;
      output += `--------------------------------------------------\n`;
      if (node.source) {
        if (lvl === 'SNIPPET') {
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
