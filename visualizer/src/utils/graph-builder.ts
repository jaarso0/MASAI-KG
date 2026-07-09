import { Node as RFNode, Edge as RFEdge } from '@xyflow/react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import { SemanticModel, Symbol } from '../types';

export function buildGraph(model: SemanticModel): { nodes: RFNode[]; edges: RFEdge[] } {
  const symbols = model.symbols;
  const containments = model.containments;
  const references = model.resolvedReferences;

  // Filter out the project root node as it is a virtual container
  const nodesList = symbols.filter(s => s.kind !== 'project');

  // Map representation of symbols
  const symbolMap = new Map<string, Symbol>();
  for (const sym of nodesList) {
    symbolMap.set(sym.id, sym);
  }

  // Define nodes for D3 simulation
  const d3Nodes = nodesList.map(sym => ({
    id: sym.id,
    x: Math.random() * 800,
    y: Math.random() * 600,
  }));

  // Define links for D3 simulation
  const d3Links: { source: string; target: string; weight: number }[] = [];

  // 1. Containments
  for (const c of containments) {
    if (symbolMap.has(c.parentId) && symbolMap.has(c.childId)) {
      d3Links.push({
        source: c.parentId,
        target: c.childId,
        weight: 1.2,
      });
    }
  }

  // 2. References
  for (const ref of references) {
    if (symbolMap.has(ref.fromSymbolId) && symbolMap.has(ref.toSymbolId)) {
      d3Links.push({
        source: ref.fromSymbolId,
        target: ref.toSymbolId,
        weight: 0.6,
      });
    }
  }

  // Run force simulation synchronously
  const simulation = forceSimulation(d3Nodes as any)
    .force('charge', forceManyBody().strength(-150))
    .force('link', forceLink(d3Links).id((d: any) => d.id).distance(80).strength((d: any) => d.weight))
    .force('collide', forceCollide().radius(25))
    .force('center', forceCenter(400, 300))
    .stop();

  for (let i = 0; i < 250; i++) {
    simulation.tick();
  }

  const rfNodes: RFNode[] = d3Nodes.map((d3n) => {
    const symbol = symbolMap.get(d3n.id)!;
    return {
      id: d3n.id,
      type: 'customNode',
      position: { x: d3n.x, y: d3n.y },
      data: { label: symbol.name, symbol },
    };
  });

  const rfEdges: RFEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const ref of references) {
    if (!symbolMap.has(ref.fromSymbolId) || !symbolMap.has(ref.toSymbolId)) {
      continue;
    }
    if (ref.fromSymbolId === ref.toSymbolId) continue;

    const edgeKey = `${ref.fromSymbolId}->${ref.toSymbolId}:${ref.kind}`;
    if (edgeKeys.has(edgeKey)) continue;
    edgeKeys.add(edgeKey);

    let strokeColor = '#3b82f6';
    let isAnimated = false;
    let strokeDasharray = undefined;

    switch (ref.kind) {
      case 'call':
        strokeColor = '#10b981';
        isAnimated = true;
        break;
      case 'inherit':
      case 'implement':
        strokeColor = '#a855f7';
        strokeDasharray = '4 4';
        break;
      case 'import':
        strokeColor = '#0ea5e9';
        strokeDasharray = '2 2';
        break;
      case 'instantiate':
        strokeColor = '#f59e0b';
        isAnimated = true;
        break;
      default:
        strokeColor = '#64748b';
        break;
    }

    rfEdges.push({
      id: `edge-${ref.candidateId || edgeKey}`,
      source: ref.fromSymbolId,
      target: ref.toSymbolId,
      type: 'default',
      animated: isAnimated,
      label: ref.kind,
      labelStyle: { fill: '#94a3b8', fontSize: 8, fontWeight: 500, fontFamily: 'Plus Jakarta Sans' },
      labelBgPadding: [2, 1],
      labelBgBorderRadius: 2,
      labelBgStyle: { fill: '#070a13', fillOpacity: 0.8 },
      style: {
        stroke: strokeColor,
        strokeWidth: 1.2,
        strokeDasharray,
      },
    });
  }

  for (const c of containments) {
    if (!symbolMap.has(c.parentId) || !symbolMap.has(c.childId)) {
      continue;
    }
    if (c.parentId === model.project.id) continue;

    const edgeKey = `${c.parentId}-contains->${c.childId}`;
    if (edgeKeys.has(edgeKey)) continue;
    edgeKeys.add(edgeKey);

    rfEdges.push({
      id: `edge-containment-${edgeKey}`,
      source: c.parentId,
      target: c.childId,
      type: 'default',
      style: {
        stroke: 'rgba(255, 255, 255, 0.05)',
        strokeWidth: 0.8,
        strokeDasharray: '2 2',
      },
    });
  }

  return { nodes: rfNodes, edges: rfEdges };
}

// ════════════════════════════════════════════
// MODULE GRAPH — Collapses to files & dependencies
// ════════════════════════════════════════════
export function buildModuleGraph(model: SemanticModel): { nodes: RFNode[]; edges: RFEdge[] } {
  const symbols = model.symbols;
  const references = model.resolvedReferences;

  const files = symbols.filter(s => s.kind === 'file');
  const fileMap = new Map<string, Symbol>();
  for (const file of files) {
    fileMap.set(file.filePath, file);
  }

  const fileDeps = new Set<string>();
  for (const ref of references) {
    const fromSym = symbols.find(s => s.id === ref.fromSymbolId);
    const toSym = symbols.find(s => s.id === ref.toSymbolId);
    if (fromSym && toSym) {
      const fromFile = fromSym.filePath;
      const toFile = toSym.filePath;
      if (fromFile && toFile && fromFile !== toFile) {
        fileDeps.add(`${fromFile}->${toFile}`);
      }
    }
  }

  const d3Nodes = files.map(file => ({
    id: file.id,
    x: Math.random() * 800,
    y: Math.random() * 600,
  }));

  const d3Links = Array.from(fileDeps).map(dep => {
    const [fromFile, toFile] = dep.split('->');
    const fromSym = fileMap.get(fromFile);
    const toSym = fileMap.get(toFile);
    return {
      source: fromSym ? fromSym.id : fromFile,
      target: toSym ? toSym.id : toFile,
      weight: 1.0,
    };
  }).filter(link => {
    return files.some(f => f.id === link.source) && files.some(f => f.id === link.target);
  });

  const simulation = forceSimulation(d3Nodes as any)
    .force('charge', forceManyBody().strength(-200))
    .force('link', forceLink(d3Links).id((d: any) => d.id).distance(120).strength(0.8))
    .force('collide', forceCollide().radius(35))
    .force('center', forceCenter(400, 300))
    .stop();

  for (let i = 0; i < 250; i++) {
    simulation.tick();
  }

  const rfNodes: RFNode[] = d3Nodes.map(d3n => {
    const fileSymbol = files.find(f => f.id === d3n.id)!;
    return {
      id: d3n.id,
      type: 'customNode',
      position: { x: d3n.x, y: d3n.y },
      data: { label: fileSymbol.name, symbol: fileSymbol },
    };
  });

  const rfEdges: RFEdge[] = d3Links.map((link, index) => ({
    id: `edge-module-${index}`,
    source: link.source,
    target: link.target,
    type: 'default',
    animated: true,
    style: {
      stroke: '#3b82f6',
      strokeWidth: 1.5,
    },
  }));

  return { nodes: rfNodes, edges: rfEdges };
}

// ════════════════════════════════════════════
// SERVICE GRAPH — Collapses to classes ending with "Service" or marked isService
// ════════════════════════════════════════════
export function buildServiceGraph(model: SemanticModel): { nodes: RFNode[]; edges: RFEdge[] } {
  const symbols = model.symbols;
  const containments = model.containments;
  const references = model.resolvedReferences;

  const services = symbols.filter(s => 
    s.kind === 'class' && (s.metadata?.isService === true || s.name.endsWith('Service'))
  );

  const serviceMap = new Map<string, Symbol>();
  for (const s of services) {
    serviceMap.set(s.id, s);
  }

  const childToService = new Map<string, string>();

  function mapChildrenOf(parentId: string, serviceId: string) {
    for (const c of containments) {
      if (c.parentId === parentId) {
        childToService.set(c.childId, serviceId);
        mapChildrenOf(c.childId, serviceId);
      }
    }
  }

  for (const service of services) {
    childToService.set(service.id, service.id);
    mapChildrenOf(service.id, service.id);
  }

  const serviceCalls = new Set<string>();
  for (const ref of references) {
    const fromServiceId = childToService.get(ref.fromSymbolId);
    const toServiceId = childToService.get(ref.toSymbolId);
    if (fromServiceId && toServiceId && fromServiceId !== toServiceId) {
      serviceCalls.add(`${fromServiceId}->${toServiceId}`);
    }
  }

  const d3Nodes = services.map(s => ({
    id: s.id,
    x: Math.random() * 800,
    y: Math.random() * 600,
  }));

  const d3Links = Array.from(serviceCalls).map(call => {
    const [fromId, toId] = call.split('->');
    return {
      source: fromId,
      target: toId,
      weight: 1.0,
    };
  });

  const simulation = forceSimulation(d3Nodes as any)
    .force('charge', forceManyBody().strength(-250))
    .force('link', forceLink(d3Links).id((d: any) => d.id).distance(150).strength(0.8))
    .force('collide', forceCollide().radius(40))
    .force('center', forceCenter(400, 300))
    .stop();

  for (let i = 0; i < 250; i++) {
    simulation.tick();
  }

  const rfNodes: RFNode[] = d3Nodes.map(d3n => {
    const sSymbol = serviceMap.get(d3n.id)!;
    return {
      id: d3n.id,
      type: 'customNode',
      position: { x: d3n.x, y: d3n.y },
      data: { label: sSymbol.name, symbol: sSymbol },
    };
  });

  const rfEdges: RFEdge[] = d3Links.map((link, index) => ({
    id: `edge-service-${index}`,
    source: link.source,
    target: link.target,
    type: 'default',
    animated: true,
    style: {
      stroke: '#a855f7',
      strokeWidth: 1.8,
    },
  }));

  return { nodes: rfNodes, edges: rfEdges };
}

// ════════════════════════════════════════════
// API GRAPH — Virtual API routes linked to handlers
// ════════════════════════════════════════════
export function buildApiGraph(model: SemanticModel): { nodes: RFNode[]; edges: RFEdge[] } {
  const symbols = model.symbols;

  const handlers = symbols.filter(s => s.metadata?.apiRoute);

  const d3Nodes: any[] = [];
  const d3Links: any[] = [];

  for (const handler of handlers) {
    const route = handler.metadata.apiRoute;
    const virtualRouteId = `api:${route.method}:${route.path}`;

    const virtualSymbol: Symbol = {
      id: virtualRouteId,
      kind: 'api_route' as any,
      name: `${route.method} ${route.path}`,
      qualifiedName: `${route.method} ${route.path}`,
      filePath: handler.filePath,
      range: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      exported: true,
      visibility: 'public',
      metadata: { apiRoute: route, handlerSymbolId: handler.id }
    };

    if (!d3Nodes.some(n => n.id === virtualRouteId)) {
      d3Nodes.push({ id: virtualRouteId, symbol: virtualSymbol });
    }
    if (!d3Nodes.some(n => n.id === handler.id)) {
      d3Nodes.push({ id: handler.id, symbol: handler });
    }

    d3Links.push({
      source: virtualRouteId,
      target: handler.id,
      weight: 1.0
    });
  }

  if (d3Nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const rawD3Nodes = d3Nodes.map(n => ({
    id: n.id,
    x: Math.random() * 800,
    y: Math.random() * 600,
  }));

  const simulation = forceSimulation(rawD3Nodes as any)
    .force('charge', forceManyBody().strength(-150))
    .force('link', forceLink(d3Links).id((d: any) => d.id).distance(100).strength(0.8))
    .force('collide', forceCollide().radius(30))
    .force('center', forceCenter(400, 300))
    .stop();

  for (let i = 0; i < 250; i++) {
    simulation.tick();
  }

  const nodes = rawD3Nodes.map(d3n => {
    const originalNode = d3Nodes.find(n => n.id === d3n.id)!;
    return {
      id: d3n.id,
      type: 'customNode',
      position: { x: d3n.x, y: d3n.y },
      data: { label: originalNode.symbol.name, symbol: originalNode.symbol },
    };
  });

  const edges = d3Links.map((link, index) => ({
    id: `edge-api-${index}`,
    source: link.source,
    target: link.target,
    type: 'default',
    animated: true,
    style: {
      stroke: '#10b981',
      strokeWidth: 1.5,
    },
  }));

  return { nodes, edges };
}

// ════════════════════════════════════════════
// DATA GRAPH — Services linked to accessed DB Models
// ════════════════════════════════════════════
export function buildDataGraph(model: SemanticModel): { nodes: RFNode[]; edges: RFEdge[] } {
  const symbols = model.symbols;
  const references = model.resolvedReferences;

  const dataModels = symbols.filter(s => s.metadata?.dataModel);
  const dataModelMap = new Map<string, Symbol>();
  for (const dm of dataModels) {
    dataModelMap.set(dm.id, dm);
  }

  const d3Nodes: any[] = [];
  const d3Links: any[] = [];
  const modelRefs = new Set<string>();

  for (const ref of references) {
    if (dataModelMap.has(ref.toSymbolId)) {
      const fromSym = symbols.find(s => s.id === ref.fromSymbolId);
      const toSym = dataModelMap.get(ref.toSymbolId)!;
      if (fromSym) {
        const parentService = symbols.find(s => 
          s.kind === 'class' && (s.metadata?.isService === true || s.name.endsWith('Service')) &&
          model.containments.some(c => c.parentId === s.id && c.childId === fromSym.id)
        );

        const accessor = parentService || fromSym;
        const linkKey = `${accessor.id}->${toSym.id}`;
        if (!modelRefs.has(linkKey)) {
          modelRefs.add(linkKey);

          if (!d3Nodes.some(n => n.id === accessor.id)) {
            d3Nodes.push({ id: accessor.id, symbol: accessor });
          }
          if (!d3Nodes.some(n => n.id === toSym.id)) {
            const virtualDbSymbol: Symbol = {
              ...toSym,
              kind: 'data_model' as any
            };
            d3Nodes.push({ id: toSym.id, symbol: virtualDbSymbol });
          }

          d3Links.push({
            source: accessor.id,
            target: toSym.id,
            weight: 1.0
          });
        }
      }
    }
  }

  if (d3Nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const rawD3Nodes = d3Nodes.map(n => ({
    id: n.id,
    x: Math.random() * 800,
    y: Math.random() * 600,
  }));

  const simulation = forceSimulation(rawD3Nodes as any)
    .force('charge', forceManyBody().strength(-150))
    .force('link', forceLink(d3Links).id((d: any) => d.id).distance(120).strength(0.8))
    .force('collide', forceCollide().radius(30))
    .force('center', forceCenter(400, 300))
    .stop();

  for (let i = 0; i < 250; i++) {
    simulation.tick();
  }

  const nodes = rawD3Nodes.map(d3n => {
    const originalNode = d3Nodes.find(n => n.id === d3n.id)!;
    return {
      id: d3n.id,
      type: 'customNode',
      position: { x: d3n.x, y: d3n.y },
      data: { label: originalNode.symbol.name, symbol: originalNode.symbol },
    };
  });

  const edges = d3Links.map((link, index) => ({
    id: `edge-data-${index}`,
    source: link.source,
    target: link.target,
    type: 'default',
    animated: true,
    style: {
      stroke: '#f59e0b',
      strokeWidth: 1.5,
    },
  }));

  return { nodes, edges };
}

// ════════════════════════════════════════════
// FLOW TRACING — Recursively traces calls starting at an endpoint/handler
// ════════════════════════════════════════════
export function traceFlow(
  model: SemanticModel,
  startSymbolId: string,
  depth: number = 4
): { nodes: RFNode[]; edges: RFEdge[] } {
  const symbols = model.symbols;
  const references = model.resolvedReferences;
  const containments = model.containments;

  const symbolMap = new Map<string, Symbol>();
  for (const sym of symbols) {
    symbolMap.set(sym.id, sym);
  }

  let actualStartId = startSymbolId;
  let virtualApiSymbol: Symbol | null = null;

  if (startSymbolId.startsWith('api:')) {
    const routeMatch = symbols.find(s => {
      const route = s.metadata?.apiRoute;
      return route && `api:${route.method}:${route.path}` === startSymbolId;
    });
    if (routeMatch) {
      actualStartId = routeMatch.id;
      const route = routeMatch.metadata.apiRoute;
      virtualApiSymbol = {
        id: startSymbolId,
        kind: 'api_route' as any,
        name: `${route.method} ${route.path}`,
        qualifiedName: `${route.method} ${route.path}`,
        filePath: routeMatch.filePath,
        range: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
        exported: true,
        visibility: 'public',
        metadata: { apiRoute: route, handlerSymbolId: routeMatch.id }
      };
    }
  }

  const visitedSymbols = new Set<string>();
  const visitedEdges = new Set<string>();

  let currentLevel = new Set<string>([actualStartId]);
  visitedSymbols.add(actualStartId);

  if (virtualApiSymbol) {
    visitedSymbols.add(virtualApiSymbol.id);
    visitedEdges.add(`${virtualApiSymbol.id}->${actualStartId}`);
  }

  function getChildrenRec(parentId: string): string[] {
    const children: string[] = [];
    for (const c of containments) {
      if (c.parentId === parentId) {
        children.push(c.childId);
        children.push(...getChildrenRec(c.childId));
      }
    }
    return children;
  }

  for (let d = 0; d < depth; d++) {
    const nextLevel = new Set<string>();

    for (const symId of currentLevel) {
      const allSourceIds = [symId, ...getChildrenRec(symId)];

      for (const ref of references) {
        if (allSourceIds.includes(ref.fromSymbolId)) {
          const targetId = ref.toSymbolId;
          if (symbolMap.has(targetId)) {
            const targetSym = symbolMap.get(targetId)!;
            let finalTargetId = targetId;

            if (targetSym.kind === 'method') {
              const containment = containments.find(c => c.childId === targetId);
              if (containment) {
                const parentSym = symbolMap.get(containment.parentId);
                if (parentSym && (parentSym.kind === 'class' && (parentSym.metadata?.isService === true || parentSym.name.endsWith('Service')))) {
                  finalTargetId = parentSym.id;
                }
              }
            }

            let finalSourceId = symId;
            const sourceSym = symbolMap.get(ref.fromSymbolId)!;
            if (sourceSym.kind === 'method') {
              const containment = containments.find(c => c.childId === ref.fromSymbolId);
              if (containment) {
                const parentSym = symbolMap.get(containment.parentId);
                if (parentSym && (parentSym.kind === 'class' && (parentSym.metadata?.isService === true || parentSym.name.endsWith('Service')))) {
                  finalSourceId = parentSym.id;
                }
              }
            }

            if (finalSourceId !== finalTargetId) {
              visitedSymbols.add(finalTargetId);
              visitedEdges.add(`${finalSourceId}->${finalTargetId}`);
              nextLevel.add(finalTargetId);
            }
          }
        }
      }
    }
    if (nextLevel.size === 0) break;
    currentLevel = nextLevel;
  }

  const traceNodesList: Symbol[] = [];
  if (virtualApiSymbol) {
    traceNodesList.push(virtualApiSymbol);
  }
  for (const id of visitedSymbols) {
    if (id !== startSymbolId || !startSymbolId.startsWith('api:')) {
      const sym = symbolMap.get(id);
      if (sym) {
        if (sym.metadata?.dataModel) {
          traceNodesList.push({
            ...sym,
            kind: 'data_model' as any
          });
        } else {
          traceNodesList.push(sym);
        }
      }
    }
  }

  const d3Nodes = traceNodesList.map(sym => ({
    id: sym.id,
    x: Math.random() * 800,
    y: Math.random() * 600,
  }));

  const d3Links = Array.from(visitedEdges).map(edge => {
    const [from, to] = edge.split('->');
    return { source: from, target: to, weight: 1.0 };
  }).filter(link => {
    return traceNodesList.some(n => n.id === link.source) && traceNodesList.some(n => n.id === link.target);
  });

  const simulation = forceSimulation(d3Nodes as any)
    .force('charge', forceManyBody().strength(-200))
    .force('link', forceLink(d3Links).id((d: any) => d.id).distance(130).strength(0.8))
    .force('collide', forceCollide().radius(35))
    .force('center', forceCenter(400, 300))
    .stop();

  for (let i = 0; i < 250; i++) {
    simulation.tick();
  }

  const rfNodes: RFNode[] = d3Nodes.map(d3n => {
    const symbol = traceNodesList.find(s => s.id === d3n.id)!;
    return {
      id: d3n.id,
      type: 'customNode',
      position: { x: d3n.x, y: d3n.y },
      data: { label: symbol.name, symbol },
    };
  });

  const rfEdges: RFEdge[] = d3Links.map((link, idx) => ({
    id: `edge-trace-${idx}`,
    source: link.source,
    target: link.target,
    type: 'default',
    animated: true,
    style: {
      stroke: '#10b981',
      strokeWidth: 2.2,
      filter: 'drop-shadow(0px 0px 4px #10b981)',
    },
    className: 'animated-trace-edge',
  }));

  return { nodes: rfNodes, edges: rfEdges };
}
