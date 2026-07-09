import * as path from 'path';
import * as fs from 'fs/promises';
import { KGNode, KGEdge } from '../stage5-graph/graph.js';
import { ContextPackage, CodeSnippet, ExecutionFlowStep, RetrievalStrategy } from './types.js';

export class ContextBuilder {
  private projectRoot: string;
  private fileCache = new Map<string, string[]>(); // filePath -> lines array

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  public async build(
    task: string,
    strategy: RetrievalStrategy,
    nodes: KGNode[],
    edges: KGEdge[]
  ): Promise<ContextPackage> {
    const relevantSymbols = nodes
      .filter(n => n.kind !== 'project' && n.kind !== 'file')
      .map(n => ({
        id: n.id,
        kind: n.kind,
        name: n.name,
        qualifiedName: n.qualifiedName,
        filePath: n.filePath,
        range: n.properties.range as any
      }));

    const relevantFiles = Array.from(new Set(nodes.map(n => n.filePath))).filter(f => f.length > 0);

    const dependencies = edges.map(e => ({
      sourceId: e.sourceId,
      targetId: e.targetId,
      kind: e.kind
    }));

    // Extract raw code snippets for symbols
    const codeSnippets: CodeSnippet[] = [];
    for (const symbol of relevantSymbols) {
      if (symbol.range) {
        const snippet = await this.extractSnippet(symbol.filePath, symbol.name, symbol.range);
        if (snippet) codeSnippets.push(snippet);
      }
    }

    // Reconstruct readable step-by-step Execution Flows (only for flow retrievals)
    const executionFlows: ExecutionFlowStep[][] = [];
    if (strategy === 'flow') {
      executionFlows.push(this.reconstructFlowPaths(nodes, edges));
    }

    return {
      task,
      strategy,
      relevantSymbols,
      relevantFiles,
      executionFlows,
      codeSnippets,
      dependencies
    };
  }

  private async extractSnippet(filePath: string, symbolName: string, range: any): Promise<CodeSnippet | null> {
    try {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const absolutePath = path.join(this.projectRoot, normalizedPath);

      let lines = this.fileCache.get(normalizedPath);
      if (!lines) {
        const source = await fs.readFile(absolutePath, 'utf-8');
        lines = source.split(/\r?\n/);
        this.fileCache.set(normalizedPath, lines);
      }

      const startLine = range.start.line; // 0-indexed
      const endLine = range.end.line;

      if (startLine >= lines.length) return null;

      const snippetLines = lines.slice(startLine, endLine + 1);
      return {
        filePath: normalizedPath,
        symbolName,
        startLine: startLine + 1, // Translate to 1-indexed for LLM
        endLine: endLine + 1,
        content: snippetLines.join('\n')
      };
    } catch (err) {
      // Return null quietly for virtual nodes / unreadable files
      return null;
    }
  }

  private reconstructFlowPaths(nodes: KGNode[], edges: KGEdge[]): ExecutionFlowStep[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const flowSteps: ExecutionFlowStep[] = [];
    let stepCount = 1;

    // Filter call & instantiation edges to track flow paths
    const callEdges = edges.filter(e => e.kind === 'call' || e.kind === 'instantiate');

    for (const edge of callEdges) {
      const source = nodeMap.get(edge.sourceId);
      const target = nodeMap.get(edge.targetId);

      if (source && target) {
        flowSteps.push({
          step: stepCount++,
          fromSymbolId: edge.sourceId,
          toSymbolId: edge.targetId,
          fromName: source.qualifiedName,
          toName: target.qualifiedName,
          relationKind: edge.kind,
          filePath: source.filePath
        });
      }
    }

    return flowSteps;
  }
}
