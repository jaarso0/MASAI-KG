import { MaterializedNode } from '../evidence/types.js';
import { getRolePriority, StructuralRole } from './role-classifier.js';

export type RepresentationLevel = 'OMIT' | 'SIGNATURE' | 'SNIPPET' | 'FULL';

export interface AllocatedRepresentation {
  nodeId: string;
  level: RepresentationLevel;
}

// Heuristic: 1 token = 4 characters
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function allocateBudget(
  nodes: MaterializedNode[],
  tokenBudget: number
): Map<string, RepresentationLevel> {
  const levels = new Map<string, RepresentationLevel>();
  
  // 1. Initialize all nodes to SIGNATURE level
  for (const node of nodes) {
    levels.set(node.nodeId, 'SIGNATURE');
  }

  // Calculate current baseline token cost (Structural Summary & Signatures)
  const getEstimatedTotalTokens = () => {
    let totalChars = 0;
    for (const node of nodes) {
      const lvl = levels.get(node.nodeId) || 'OMIT';
      if (lvl === 'OMIT') continue;

      totalChars += node.nodeId.length + node.name.length + node.kind.length + node.file.length;

      if (lvl === 'SIGNATURE') {
        totalChars += (node.signature || '').length + (node.docs || '').length;
      } else if (lvl === 'SNIPPET') {
        const sourceText = node.source?.text || '';
        // Snippet gets docs plus first 800 characters of source code
        const snippetText = sourceText.slice(0, 800);
        totalChars += (node.signature || '').length + (node.docs || '').length + snippetText.length;
      } else if (lvl === 'FULL') {
        totalChars += (node.signature || '').length + (node.docs || '').length + (node.source?.text || '').length;
      }
    }
    // Structural overhead (the per-node id/role scaffolding) plus the actual body characters.
    // NOTE: previously this did `estimateTokens(String(totalChars))`, which measured the number
    // of *digits* in the char count (e.g. 100000 chars -> "100000" -> 2 tokens) rather than the
    // content itself — so the budget was effectively infinite and no node ever got downgraded,
    // letting a large neighborhood balloon to tens of thousands of tokens. Count the real chars.
    const overheadChars = JSON.stringify(nodes.map(n => ({ id: n.nodeId, role: n.structuralRole }))).length;
    return Math.ceil((totalChars + overheadChars) / 4);
  };

  let currentTokens = getEstimatedTotalTokens();

  // 2. Downgrade loop: if baseline exceeds budget, downgrade low-priority nodes to OMIT
  if (currentTokens > tokenBudget) {
    const sortedForDowngrade = [...nodes].sort((a, b) => {
      return getRolePriority(a.structuralRole) - getRolePriority(b.structuralRole);
    });

    for (const node of sortedForDowngrade) {
      if (currentTokens <= tokenBudget) break;
      levels.set(node.nodeId, 'OMIT');
      currentTokens = getEstimatedTotalTokens();
    }
  } else {
    // 3. Upgrade loop: greedily upgrade high-priority nodes to FULL/SNIPPET
    const sortedForUpgrade = [...nodes].sort((a, b) => {
      return getRolePriority(b.structuralRole) - getRolePriority(a.structuralRole);
    });

    for (const node of sortedForUpgrade) {
      if (['class', 'file', 'module', 'project', 'package'].includes(node.kind)) {
        levels.set(node.nodeId, 'SIGNATURE');
        continue;
      }

      if (!node.source?.text) continue; // nothing to upgrade

      // Try FULL upgrade
      levels.set(node.nodeId, 'FULL');
      let newTokens = getEstimatedTotalTokens();
      if (newTokens <= tokenBudget) {
        currentTokens = newTokens;
        continue;
      }

      // Try SNIPPET upgrade if FULL doesn't fit
      levels.set(node.nodeId, 'SNIPPET');
      newTokens = getEstimatedTotalTokens();
      if (newTokens <= tokenBudget) {
        currentTokens = newTokens;
      } else {
        // Revert to SIGNATURE if neither fits
        levels.set(node.nodeId, 'SIGNATURE');
      }
    }
  }

  return levels;
}
