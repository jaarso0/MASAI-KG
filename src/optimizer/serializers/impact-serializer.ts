import { MaterializedEvidence } from '../../evidence/types.js';
import { RepresentationLevel } from '../budget-allocator.js';
import { getDisplayName, serializeNavigationPackage, formatResolutionConfidence, formatUnresolvedRefs, formatTestCoverage, formatConfidenceSummary } from './helper.js';

export function serializeImpact(
  evidence: MaterializedEvidence,
  rootId: string,
  affected: Array<{ nodeId: string; depth: number; via: string }>,
  levels: Map<string, RepresentationLevel>
): string {
  const nodeMap = new Map(evidence.nodes.map(n => [n.nodeId, n]));
  const rootNode = nodeMap.get(rootId);
  // Index edges by "source->kind" so each affected dependent can show how confidently
  // the edge that pulled it in was resolved.
  const resolutionByEdgeKey = new Map<string, string | undefined>();
  evidence.edges.forEach(e => {
    resolutionByEdgeKey.set(`${e.source}:${e.kind}`, e.resolutionMethod);
  });

  let output = '=== DEPENDENCY IMPACT CONE ===\n\n';

  // 1. Root symbol (where change was made)
  if (rootNode) {
    const rootName = getDisplayName(rootNode, rootId);
    output += `Changed Symbol: ${rootName} (${rootNode.kind})\n`;
    output += `File: ${rootNode.file}\n`;
    if (rootNode.signature) output += `Signature: ${rootNode.signature}\n`;
    if (rootNode.docs) output += `Docs:\n${rootNode.docs.split('\n').map(l => '  ' + l).join('\n')}\n`;
    output += formatUnresolvedRefs(rootNode);
    output += formatTestCoverage(rootNode);
  } else {
    output += `Changed Symbol ID: ${rootId}\n`;
  }
  output += '\n--------------------------------------------------\n\n';

  if (affected.length === 0) {
    output += 'No downstream dependents or affected symbols were found.\n';
    return output.trim();
  }

  // 1b. Confidence rollup — how much of this cone to actually trust before reading every line
  const affectedResolutionMethods = affected.map(a => ({
    resolutionMethod: resolutionByEdgeKey.get(`${a.nodeId}:${a.via}`)
  }));
  output += formatConfidenceSummary(affectedResolutionMethods, 'dependent(s) found');
  output += '\n';

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
        const displayName = getDisplayName(node, item.nodeId);
        const resolutionMethod = resolutionByEdgeKey.get(`${item.nodeId}:${item.via}`);
        output += `- ${displayName} (${node.kind}) [via: ${item.via}]${formatResolutionConfidence(resolutionMethod)}\n`;
        output += `  File: ${node.file}\n`;
        output += formatUnresolvedRefs(node);
        output += formatTestCoverage(node);
      } else {
        output += `- [ID: ${item.nodeId}] [via: ${item.via}]\n`;
      }
    });
    output += '\n';
  });

  // 3. Recommended Code Ranges to Read Next (excluding rootId)
  const spansOutput = serializeNavigationPackage(evidence.nodes, levels, [rootId]);
  if (spansOutput) {
    output += spansOutput;
  }

  return output.trim();
}
