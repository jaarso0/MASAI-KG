import { KnowledgeGraph, KGNode, KGEdge } from '../stage5-graph/graph.js';
import { Symbol } from '../semantic-model/types.js';

export class RetrievalIndexes {
  public bySymbolName = new Map<string, KGNode[]>();
  public byQualifiedName = new Map<string, KGNode[]>();
  public byFile = new Map<string, KGNode[]>();
  public byKind = new Map<string, KGNode[]>();
  public byModule = new Map<string, KGNode>();
  public byEndpoint = new Map<string, KGNode>(); // "METHOD PATH" -> Endpoint handler node
  public byService = new Map<string, KGNode>();  // ServiceName -> Service class node
  public reverseCallers = new Map<string, KGEdge[]>();     // targetId -> incoming calls
  public reverseDependencies = new Map<string, KGEdge[]>(); // targetId -> incoming relations of any kind

  constructor(graph: KnowledgeGraph) {
    this.build(graph);
  }

  public build(graph: KnowledgeGraph): void {
    this.clear();
    const nodes = graph.getAllNodes();

    for (const node of nodes) {
      this.addNode(node);
      const outgoingEdges = graph.getEdgesFrom(node.id);
      for (const edge of outgoingEdges) {
        this.addEdge(edge);
      }
    }
  }

  private addNode(node: KGNode): void {
    // 1. Symbol Name
    const nameLower = node.name.toLowerCase();
    const nameList = this.bySymbolName.get(nameLower) || [];
    nameList.push(node);
    this.bySymbolName.set(nameLower, nameList);

    // 2. Qualified Name
    const qnameLower = node.qualifiedName.toLowerCase();
    const qnameList = this.byQualifiedName.get(qnameLower) || [];
    qnameList.push(node);
    this.byQualifiedName.set(qnameLower, qnameList);

    // 3. File
    const fileList = this.byFile.get(node.filePath) || [];
    fileList.push(node);
    this.byFile.set(node.filePath, fileList);

    // 4. Kind
    const kindList = this.byKind.get(node.kind) || [];
    kindList.push(node);
    this.byKind.set(node.kind, kindList);

    // 5. Endpoint
    if (node.properties?.apiRoute) {
      const route = node.properties.apiRoute as { path: string; method: string };
      if (route.method && route.path) {
        const endpointKey = `${route.method.toUpperCase()} ${route.path}`;
        this.byEndpoint.set(endpointKey, node);
      }
    }

    // 6. Service
    if (node.kind === 'class' && (node.properties?.isService === true || node.name.endsWith('Service'))) {
      this.byService.set(node.name, node);
    }

    // 7. Module path indexing
    if (node.kind === 'file') {
      const base = node.filePath.replace(/\.[^/.]+$/, "");
      const dotted = base.replace(/\//g, '.');
      this.byModule.set(base, node);
      this.byModule.set(dotted, node);
    }
  }

  private addEdge(edge: KGEdge): void {
    if (edge.kind === 'call') {
      const callers = this.reverseCallers.get(edge.targetId) || [];
      callers.push(edge);
      this.reverseCallers.set(edge.targetId, callers);
    }
    const deps = this.reverseDependencies.get(edge.targetId) || [];
    deps.push(edge);
    this.reverseDependencies.set(edge.targetId, deps);
  }

  public updateFile(filePath: string, newSymbols: Symbol[], allResolvedReferences: any[], isDeletion: boolean = false): void {
    const normPath = filePath.replace(/\\/g, '/');

    // 1. Remove old nodes belonging to the file from maps
    for (const [key, list] of this.bySymbolName.entries()) {
      this.bySymbolName.set(key, list.filter(n => n.filePath !== normPath));
    }
    for (const [key, list] of this.byQualifiedName.entries()) {
      this.byQualifiedName.set(key, list.filter(n => n.filePath !== normPath));
    }
    for (const [key, list] of this.byKind.entries()) {
      this.byKind.set(key, list.filter(n => n.filePath !== normPath));
    }
    this.byFile.delete(normPath);

    for (const [key, node] of this.byEndpoint.entries()) {
      if (node.filePath === normPath) this.byEndpoint.delete(key);
    }
    for (const [key, node] of this.byService.entries()) {
      if (node.filePath === normPath) this.byService.delete(key);
    }
    for (const [key, node] of this.byModule.entries()) {
      if (node.filePath === normPath) this.byModule.delete(key);
    }

    // 2. Filter out stale caller/dependency edges
    for (const [targetId, edges] of this.reverseCallers.entries()) {
      const filtered = edges.filter(e => {
        const sourceFile = e.sourceId.split('::')[0];
        const targetFile = e.targetId.split('::')[0];
        return sourceFile !== normPath && targetFile !== normPath;
      });
      if (filtered.length === 0) this.reverseCallers.delete(targetId);
      else this.reverseCallers.set(targetId, filtered);
    }

    for (const [targetId, edges] of this.reverseDependencies.entries()) {
      const filtered = edges.filter(e => {
        const sourceFile = e.sourceId.split('::')[0];
        const targetFile = e.targetId.split('::')[0];
        return sourceFile !== normPath && targetFile !== normPath;
      });
      if (filtered.length === 0) this.reverseDependencies.delete(targetId);
      else this.reverseDependencies.set(targetId, filtered);
    }

    if (isDeletion) return;

    // 3. Map and add updated symbols as KGNodes
    for (const sym of newSymbols) {
      const node: KGNode = {
        id: sym.id,
        kind: sym.kind,
        name: sym.name,
        qualifiedName: sym.qualifiedName,
        filePath: sym.filePath,
        properties: {
          range: sym.range,
          exported: sym.exported,
          visibility: sym.visibility,
          ...sym.metadata
        }
      };
      this.addNode(node);
    }

    // 4. Re-add active references that affect this file
    for (const ref of allResolvedReferences) {
      const sourceFile = ref.fromSymbolId.split('::')[0];
      const targetFile = ref.toSymbolId.split('::')[0];
      if (sourceFile === normPath || targetFile === normPath) {
        this.addEdge({
          sourceId: ref.fromSymbolId,
          targetId: ref.toSymbolId,
          kind: ref.kind,
          resolutionMethod: ref.resolutionMethod
        });
      }
    }
  }

  public clear(): void {
    this.bySymbolName.clear();
    this.byQualifiedName.clear();
    this.byFile.clear();
    this.byKind.clear();
    this.byModule.clear();
    this.byEndpoint.clear();
    this.byService.clear();
    this.reverseCallers.clear();
    this.reverseDependencies.clear();
  }
}
