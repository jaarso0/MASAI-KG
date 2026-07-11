import { MaterializedEvidence } from '../../evidence/types.js';
import { RepresentationLevel } from '../budget-allocator.js';
import { getDisplayName, serializeNavigationPackage, formatResolutionConfidence, formatUnresolvedRefs, formatTestCoverage, formatConfidenceSummary } from './helper.js';

export function serializeRegion(
  evidence: MaterializedEvidence,
  roots: string[],
  levels: Map<string, RepresentationLevel>,
  omittedEdgeCount: number = 0
): string {
  const nodeMap = new Map(evidence.nodes.map(n => [n.nodeId, n]));

  let output = '=== NEIGHBORHOOD REGION EXPORT ===\n\n';

  // 1. List Anchors
  output += 'Anchors:\n';
  roots.forEach(rootId => {
    const node = nodeMap.get(rootId);
    if (node) {
      const displayName = getDisplayName(node, rootId);
      output += `- ${displayName} (${node.kind}) [ID: ${node.nodeId}]\n`;
      output += `  File: ${node.file}\n`;
      if (node.signature) output += `  Signature: ${node.signature}\n`;
      if (node.docs) output += `  Docs:\n${node.docs.split('\n').map(l => '    ' + l).join('\n')}\n`;
      output += formatUnresolvedRefs(node);
      output += formatTestCoverage(node);
    } else {
      output += `- [Unresolved Anchor ID: ${rootId}]\n`;
    }
  });
  output += '\n';

  // 2. Incoming and Outgoing Edges summary (Deduplicated)
  // Only reference edges (call/import/inherit/etc.) carry a resolutionMethod — structural
  // containment edges (has_member/owns) aren't "resolved" in the same sense, so they're
  // excluded from the confidence rollup to avoid inflating the high-confidence count.
  const referenceEdges = evidence.edges.filter(e => e.resolutionMethod !== undefined);
  output += formatConfidenceSummary(referenceEdges, 'reference edge(s) in this neighborhood');
  output += '\nRelationships:\n';

  // Edges arrive already proactively capped and relevance-ranked by the executor
  // (see executeRegion's edgeLimit) — so a hub query never materializes thousands of
  // edges just to discard them here. This is a final display cap on top of that.
  const MAX_RELATIONSHIP_LINES = 60;
  const rootSet = new Set(roots);
  const printedEdges = new Set<string>();
  const dedupedEdges: typeof evidence.edges = [];
  evidence.edges.forEach(edge => {
    const edgeKey = `${edge.source}->${edge.target}:${edge.kind}:${edge.callsite?.line || ''}`;
    if (printedEdges.has(edgeKey)) return;
    printedEdges.add(edgeKey);
    dedupedEdges.push(edge);
  });

  dedupedEdges.sort((a, b) => {
    const aTouchesRoot = rootSet.has(a.source) || rootSet.has(a.target) ? 0 : 1;
    const bTouchesRoot = rootSet.has(b.source) || rootSet.has(b.target) ? 0 : 1;
    return aTouchesRoot - bTouchesRoot;
  });

  const shown = dedupedEdges.slice(0, MAX_RELATIONSHIP_LINES);
  shown.forEach(edge => {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    const srcName = getDisplayName(src, edge.source);
    const tgtName = getDisplayName(tgt, edge.target);

    output += `- ${srcName} --[${edge.kind}]--> ${tgtName}${formatResolutionConfidence(edge.resolutionMethod)}\n`;
    if (edge.callsite) {
      output += `  Callsite: ${edge.callsite.file}:${edge.callsite.line} -> "${edge.callsite.snippet}"\n`;
    }
  });
  const totalOmitted = Math.max(0, dedupedEdges.length - shown.length) + omittedEdgeCount;
  if (totalOmitted > 0) {
    output += `... and ${totalOmitted} more edge(s) not shown (relevance-capped). Narrow with edgeKinds, direction, or a smaller depth to focus the result.\n`;
  }
  output += '\n';

  // 3. Recommended Code Ranges to Read Next
  const spansOutput = serializeNavigationPackage(evidence.nodes, levels);
  if (spansOutput) {
    output += spansOutput;
  }

  return output.trim();
}
