import { RetrievalIndexes } from './indexes.js';
import { CandidateResult } from './types.js';
import { KGNode } from '../stage5-graph/graph.js';

export class CandidateDiscovery {
  private indexes: RetrievalIndexes;
  private stopWords = new Set(['add', 'delete', 'update', 'fix', 'remove', 'get', 'set', 'support', 'for', 'in', 'and', 'the', 'is', 'to', 'how', 'does', 'where']);

  constructor(indexes: RetrievalIndexes) {
    this.indexes = indexes;
  }

  public discover(taskQuery: string, limit: number = 10): CandidateResult[] {
    const tokens = this.tokenize(taskQuery);
    const candidates = new Map<string, { node: KGNode; score: number; reasons: string[] }>();

    if (tokens.length === 0) return [];

    // Heuristic 1: Match HTTP methods and routes (e.g. "POST /login" or "GET /users")
    const routeMatch = taskQuery.match(/(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);
    if (routeMatch) {
      const method = routeMatch[1].toUpperCase();
      const path = routeMatch[2];
      const endpointKey = `${method} ${path}`;
      const node = this.indexes.byEndpoint.get(endpointKey);
      if (node) {
        this.addOrScore(candidates, node, 15, `Exact Endpoint Match: ${endpointKey}`);
      }
    }

    // Heuristic 2: Search by token matches in names, qualified names, and paths
    for (const token of tokens) {
      const tokLower = token.toLowerCase();

      // Service Class matching
      const serviceNode = this.indexes.byService.get(token);
      if (serviceNode) {
        this.addOrScore(candidates, serviceNode, 10, `Exact Service Name Match: ${token}`);
      }

      // Matching Symbol Name Index (contains partial name matches)
      for (const [name, nodes] of this.indexes.bySymbolName.entries()) {
        if (name === tokLower) {
          for (const n of nodes) {
            this.addOrScore(candidates, n, 8, `Exact Symbol Name Match: ${n.name}`);
          }
        } else if (name.includes(tokLower)) {
          for (const n of nodes) {
            this.addOrScore(candidates, n, 4, `Substring Symbol Name Match: ${n.name}`);
          }
        }
      }

      // Matching Qualified Name Index
      for (const [qname, nodes] of this.indexes.byQualifiedName.entries()) {
        if (qname === tokLower) {
          for (const n of nodes) {
            this.addOrScore(candidates, n, 6, `Exact Qualified Name Match: ${n.qualifiedName}`);
          }
        } else if (qname.includes(tokLower)) {
          for (const n of nodes) {
            this.addOrScore(candidates, n, 3, `Substring Qualified Name Match: ${n.qualifiedName}`);
          }
        }
      }

      // Matching File Name in Paths
      for (const [filePath, nodes] of this.indexes.byFile.entries()) {
        const fileLower = filePath.toLowerCase();
        if (fileLower.includes(tokLower)) {
          for (const n of nodes) {
            const mult = (n.kind === 'class' || n.kind === 'function') ? 5 : 2;
            this.addOrScore(candidates, n, mult, `File Path Match: ${filePath}`);
          }
        }
      }
    }

    // Sort candidates by score descending
    const sorted = Array.from(candidates.values())
      .map(c => ({
        node: c.node,
        score: c.score,
        matchReasons: c.reasons
      }))
      .sort((a, b) => b.score - a.score);

    return sorted.slice(0, limit);
  }

  private tokenize(query: string): string[] {
    return query
      .replace(/[^a-zA-Z0-9_/]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1 && !this.stopWords.has(t.toLowerCase()));
  }

  private addOrScore(map: Map<string, { node: KGNode; score: number; reasons: string[] }>, node: KGNode, points: number, reason: string): void {
    const existing = map.get(node.id);
    if (existing) {
      existing.score += points;
      existing.reasons.push(reason);
    } else {
      map.set(node.id, {
        node,
        score: points,
        reasons: [reason]
      });
    }
  }
}
