import { MaterializedNode } from '../../evidence/types.js';
import { RepresentationLevel } from '../budget-allocator.js';

export function getDisplayName(node: any, fallbackId: string): string {
  if (!node) return fallbackId;
  return node.qualifiedName || node.name || fallbackId;
}

/**
 * Serializes target nodes into a clean "Navigation Package" recommended reading index.
 * Groups by file path, sorts chronologically by line number, and details roles/kinds.
 */
export function serializeNavigationPackage(
  nodes: MaterializedNode[],
  levels: Map<string, RepresentationLevel>,
  excludeNodeIds: string[] = []
): string {
  const targetNodes = nodes.filter(n => {
    if (excludeNodeIds.includes(n.nodeId)) return false;
    const lvl = levels.get(n.nodeId) || 'SIGNATURE';
    return lvl !== 'OMIT';
  });

  if (targetNodes.length === 0) return '';

  let output = 'Recommended Code Ranges to Read Next:\n\n';

  // Group by file path
  const fileGroups = new Map<string, MaterializedNode[]>();
  targetNodes.forEach(node => {
    const list = fileGroups.get(node.file) || [];
    list.push(node);
    fileGroups.set(node.file, list);
  });

  // Sort files alphabetically
  const sortedFiles = Array.from(fileGroups.keys()).sort();

  sortedFiles.forEach(file => {
    output += `File: ${file}\n`;

    // Sort nodes in this file by starting line number
    const fileNodes = fileGroups.get(file)!;
    fileNodes.sort((a, b) => {
      const startA = a.range?.startLine || 0;
      const startB = b.range?.startLine || 0;
      return startA - startB;
    });

    fileNodes.forEach(node => {
      const dispName = getDisplayName(node, node.nodeId);
      const role = node.structuralRole;
      const rangeStr = node.range ? `${node.range.startLine}-${node.range.endLine}` : '';

      const parts: string[] = [];
      parts.push(dispName);
      parts.push(`Role: ${role}`);
      if (node.kind !== 'file' && node.kind !== 'class') {
        parts.push(`Kind: ${node.kind}`);
      }

      const infoStr = parts.join(', ');

      if (rangeStr) {
        output += `  - Lines ${rangeStr}: ${infoStr}\n`;
      } else {
        output += `  - ${infoStr}\n`;
      }
    });
    output += '\n';
  });

  return output.trim();
}
