import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Node as RFNode,
  Edge as RFEdge,
} from '@xyflow/react';
import {
  Search,
  Activity,
  Layers,
  ArrowRightLeft,
  X,
  AlertTriangle,
  FolderOpen,
  Info,
  Check,
  ChevronRight,
  Focus,
  BookOpen,
} from 'lucide-react';

import { SemanticModel, Symbol, ResolvedReference } from './types';
import {
  buildGraph,
  buildModuleGraph,
  buildServiceGraph,
  buildApiGraph,
  buildDataGraph,
  traceFlow
} from './utils/graph-builder';
import { CustomNode, FileGroupNode, ClassGroupNode, getSymbolTheme } from './components/CustomNode';

const nodeTypes = {
  customNode: CustomNode,
  fileGroup: FileGroupNode,
  classGroup: ClassGroupNode,
};

function LegendSection() {
  return (
    <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: 20, width: '100%' }}>
      <h4 style={{ fontFamily: 'var(--font-title)', margin: '0 0 16px 0', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>
        Graph Legend
      </h4>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Node Types */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Symbols (Nodes)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'File', color: '#0ea5e9' },
              { label: 'Class', color: '#a855f7' },
              { label: 'Interface', color: '#ec4899' },
              { label: 'Struct', color: '#14b8a6' },
              { label: 'Function', color: '#10b981' },
              { label: 'Method', color: '#f59e0b' },
              { label: 'Variable', color: '#f43f5e' },
              { label: 'Type Alias', color: '#6366f1' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: item.color, boxShadow: `0 0 4px ${item.color}` }}></div>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Edge Relations */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Relations (Edges)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Call (Func/Method)', color: '#10b981', style: 'solid', desc: 'glowing solid' },
              { label: 'Instantiate (Class/Struct)', color: '#f59e0b', style: 'solid', desc: 'glowing solid' },
              { label: 'Import Specifier', color: '#0ea5e9', style: 'dashed', desc: 'dashed' },
              { label: 'Inherit / Implement', color: '#a855f7', style: 'dotted', desc: 'dotted' },
              { label: 'Containment', color: 'rgba(255, 255, 255, 0.15)', style: 'dashed', desc: 'faint dashed' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5 }}>
                <span>{item.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.desc}</span>
                  <div 
                    style={{ 
                      width: 30, 
                      height: item.style === 'solid' ? 2 : 0, 
                      borderTop: item.style !== 'solid' ? `1px ${item.style} ${item.color}` : 'none',
                      backgroundColor: item.style === 'solid' ? item.color : 'transparent',
                    }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function VisualizerDashboard() {
  const { fitView, setCenter } = useReactFlow();

  // Model & Loading state
  const [model, setModel] = useState<SemanticModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set());
  const [selectedEdgeKinds, setSelectedEdgeKinds] = useState<Set<string>>(new Set());

  // Interactive selection state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [neighborhoodNodeId, setNeighborhoodNodeId] = useState<string | null>(null);

  // View mode selection
  type ViewMode = 'flat' | 'module' | 'service' | 'api' | 'data';
  const [viewMode, setViewMode] = useState<ViewMode>('flat');

  // Active Execution Flow Trace
  const [activeTraceStartId, setActiveTraceStartId] = useState<string | null>(null);
  const [traceDepth, setTraceDepth] = useState<number>(4);

  // Load model JSON
  useEffect(() => {
    fetch('/api/model')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch semantic model');
        return res.json();
      })
      .then((data: SemanticModel) => {
        setModel(data);
        setIsLoading(false);

        // Initialize active filters
        const kinds = new Set(data.symbols.map((s) => s.kind));
        kinds.delete('project'); // project is a root virtual concept
        setSelectedKinds(kinds);

        const edgeKinds = new Set(data.resolvedReferences.map((r) => r.kind));
        setSelectedEdgeKinds(edgeKinds);
      })
      .catch((err) => {
        setError(err.message || 'Error loading model');
        setIsLoading(false);
      });
  }, []);

  // Map representation of symbols, containments & references for fast lookups
  const symbolMap = useMemo(() => {
    const map = new Map<string, Symbol>();
    if (!model) return map;
    for (const sym of model.symbols) {
      map.set(sym.id, sym);
    }
    return map;
  }, [model]);

  const parentToChildren = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!model) return map;
    for (const c of model.containments) {
      const list = map.get(c.parentId) || [];
      list.push(c.childId);
      map.set(c.parentId, list);
    }
    return map;
  }, [model]);

  const childToParent = useMemo(() => {
    const map = new Map<string, string>();
    if (!model) return map;
    for (const c of model.containments) {
      map.set(c.childId, c.parentId);
    }
    return map;
  }, [model]);

  // Compute references maps for Inspector
  const referencesTo = useMemo(() => {
    const map = new Map<string, ResolvedReference[]>();
    if (!model) return map;
    for (const ref of model.resolvedReferences) {
      const list = map.get(ref.toSymbolId) || [];
      list.push(ref);
      map.set(ref.toSymbolId, list);
    }
    return map;
  }, [model]);

  const referencesFrom = useMemo(() => {
    const map = new Map<string, ResolvedReference[]>();
    if (!model) return map;
    for (const ref of model.resolvedReferences) {
      const list = map.get(ref.fromSymbolId) || [];
      list.push(ref);
      map.set(ref.fromSymbolId, list);
    }
    return map;
  }, [model]);

  // Derive counts for filter panel
  const counts = useMemo(() => {
    const kindCounts: Record<string, number> = {};
    const edgeCounts: Record<string, number> = {};

    if (model) {
      for (const s of model.symbols) {
        if (s.kind !== 'project') {
          kindCounts[s.kind] = (kindCounts[s.kind] || 0) + 1;
        }
      }
      for (const r of model.resolvedReferences) {
        edgeCounts[r.kind] = (edgeCounts[r.kind] || 0) + 1;
      }
    }

    return { kinds: kindCounts, edges: edgeCounts };
  }, [model]);

  // Translate semantic-model to RF nodes/edges depending on view mode and active flow trace
  const currentGraph = useMemo(() => {
    if (!model) return { nodes: [], edges: [] };

    if (activeTraceStartId) {
      return traceFlow(model, activeTraceStartId, traceDepth);
    }

    switch (viewMode) {
      case 'module':
        return buildModuleGraph(model);
      case 'service':
        return buildServiceGraph(model);
      case 'api':
        return buildApiGraph(model);
      case 'data':
        return buildDataGraph(model);
      case 'flat':
      default:
        return buildGraph(model);
    }
  }, [model, viewMode, activeTraceStartId, traceDepth]);

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);

  // Sync graph state on currentGraph change
  useEffect(() => {
    if (currentGraph.nodes.length > 0) {
      setNodes(currentGraph.nodes);
      setEdges(currentGraph.edges);
      // Wait minor tick for renders
      setTimeout(() => fitView({ padding: 0.1, duration: 800 }), 50);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [currentGraph, fitView, setNodes, setEdges]);

  // Compute connections in Neighborhood Mode
  const connectedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!neighborhoodNodeId || !model) return ids;

    // Direct callers and callees
    for (const ref of model.resolvedReferences) {
      if (ref.fromSymbolId === neighborhoodNodeId) {
        ids.add(ref.toSymbolId);
      }
      if (ref.toSymbolId === neighborhoodNodeId) {
        ids.add(ref.fromSymbolId);
      }
    }

    // Direct children (if neighborhood target is a class/file)
    const children = parentToChildren.get(neighborhoodNodeId) || [];
    for (const childId of children) {
      ids.add(childId);
    }

    // Direct parent
    const parentId = childToParent.get(neighborhoodNodeId);
    if (parentId) ids.add(parentId);

    return ids;
  }, [neighborhoodNodeId, model, parentToChildren, childToParent]);

  // Evaluate final visibility of nodes based on active filters, search and neighborhood
  const visibleNodesMap = useMemo(() => {
    const visibility = new Map<string, boolean>();
    if (!model || nodes.length === 0) return visibility;

    const nodeMap = new Map<string, RFNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    // Helper to evaluate nodes recursively
    function isNodeVisible(nodeId: string): boolean {
      const cache = visibility.get(nodeId);
      if (cache !== undefined) return cache;

      if (activeTraceStartId) {
        visibility.set(nodeId, true);
        return true;
      }

      const node = nodeMap.get(nodeId);
      if (!node) {
        visibility.set(nodeId, false);
        return false;
      }

      const symbol = (node.data as any).symbol as Symbol;
      if (!symbol) {
        visibility.set(nodeId, false);
        return false;
      }

      // If in neighborhood mode, enforce isolation
      if (neighborhoodNodeId) {
        const isSelf = nodeId === neighborhoodNodeId;
        const isNeighbor = connectedNodeIds.has(nodeId);
        
        if (isSelf || isNeighbor) {
          visibility.set(nodeId, true);
          return true;
        }

        // Parent container of neighborhood anchor/neighbors must be shown so children render inside it
        const children = parentToChildren.get(nodeId) || [];
        const hasVisibleChild = children.some((cId) => {
          return cId === neighborhoodNodeId || connectedNodeIds.has(cId);
        });
        if (hasVisibleChild) {
          visibility.set(nodeId, true);
          return true;
        }

        visibility.set(nodeId, false);
        return false;
      }

      // Default filter and search
      // Leaf symbols
      const isContainer = symbol.kind === 'file' || symbol.kind === 'class' || symbol.kind === 'interface' || symbol.kind === 'struct';
      if (!isContainer) {
        const matchesSearch =
          symbol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          symbol.qualifiedName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesKind = selectedKinds.has(symbol.kind);
        const active = matchesSearch && matchesKind;
        visibility.set(nodeId, active);
        return active;
      }

      // Group nodes: show if name matches OR if any contained sub-elements match
      const matchesSelf =
        (symbol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          symbol.qualifiedName.toLowerCase().includes(searchTerm.toLowerCase())) &&
        selectedKinds.has(symbol.kind);

      if (matchesSelf) {
        visibility.set(nodeId, true);
        return true;
      }

      const children = parentToChildren.get(nodeId) || [];
      const hasVisibleChild = children.some((childId) => isNodeVisible(childId));
      visibility.set(nodeId, hasVisibleChild);
      return hasVisibleChild;
    }

    for (const node of nodes) {
      isNodeVisible(node.id);
    }

    return visibility;
  }, [nodes, model, searchTerm, selectedKinds, neighborhoodNodeId, connectedNodeIds, parentToChildren, symbolMap]);

  // Computed layout state mapping nodes & edges visible flags
  const displayNodes = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      hidden: !visibleNodesMap.get(node.id),
      selected: node.id === selectedNodeId,
    }));
  }, [nodes, visibleNodesMap, selectedNodeId]);

  const displayEdges = useMemo(() => {
    return edges.map((edge) => {
      const sourceVisible = visibleNodesMap.get(edge.source);
      const targetVisible = visibleNodesMap.get(edge.target);
      const edgeFilterMatch = selectedEdgeKinds.has(edge.label as string);

      // Hide edges if endpoints are filtered out
      const isHidden = !sourceVisible || !targetVisible || !edgeFilterMatch;

      return {
        ...edge,
        hidden: isHidden,
      };
    });
  }, [edges, visibleNodesMap, selectedEdgeKinds]);

  // Handle sidebar navigation click
  const selectAndFocusNode = useCallback(
    (id: string) => {
      setSelectedNodeId(id);
      const node = nodes.find((n) => n.id === id);
      if (node) {
        // Find absolute canvas coordinates of the node.
        // If nested, we walk up parent relative offsets
        let x = node.position.x;
        let y = node.position.y;
        let currentParentId = node.parentId;

        while (currentParentId) {
          const parentNode = nodes.find((n) => n.id === currentParentId);
          if (parentNode) {
            x += parentNode.position.x;
            y += parentNode.position.y;
            currentParentId = parentNode.parentId;
          } else {
            break;
          }
        }

        // Center on node
        setCenter(x + 90, y + 20, { zoom: 1.25, duration: 800 });
      }
    },
    [nodes, setCenter],
  );

  // Custom node selection handler
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: RFNode) => {
      setSelectedNodeId(node.id);
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Filter handlers
  const toggleKindFilter = (kind: string) => {
    const next = new Set(selectedKinds);
    if (next.has(kind)) {
      next.delete(kind);
    } else {
      next.add(kind);
    }
    setSelectedKinds(next);
  };

  const toggleEdgeFilter = (kind: string) => {
    const next = new Set(selectedEdgeKinds);
    if (next.has(kind)) {
      next.delete(kind);
    } else {
      next.add(kind);
    }
    setSelectedEdgeKinds(next);
  };

  // Node Inspector selection
  const selectedSymbol = useMemo(() => {
    if (!selectedNodeId) return null;
    const activeNode = nodes.find(n => n.id === selectedNodeId);
    if (activeNode && (activeNode.data as any)?.symbol) {
      return (activeNode.data as any).symbol as Symbol;
    }
    return symbolMap.get(selectedNodeId) || null;
  }, [selectedNodeId, nodes, symbolMap]);

  const selectedRelations = useMemo(() => {
    if (!selectedNodeId) return null;

    const from = referencesFrom.get(selectedNodeId) || [];
    const to = referencesTo.get(selectedNodeId) || [];

    return {
      referencesMade: from.map((ref) => ({
        ref,
        targetSymbol: symbolMap.get(ref.toSymbolId)!,
      })).filter(item => item.targetSymbol !== undefined),
      referencesReceived: to.map((ref) => ({
        ref,
        sourceSymbol: symbolMap.get(ref.fromSymbolId)!,
      })).filter(item => item.sourceSymbol !== undefined),
    };
  }, [selectedNodeId, referencesFrom, referencesTo, symbolMap]);

  // Loading Screens
  if (isLoading) {
    return (
      <div className="loading-overlay">
        <div className="spinner"></div>
        <div className="loading-text">Building Knowledge Graph Visualizer...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-overlay">
        <AlertTriangle size={48} color="#ef4444" />
        <div className="loading-text" style={{ color: '#ef4444', marginTop: 12 }}>
          {error}
        </div>
      </div>
    );
  }

  if (!model) return null;

  return (
    <div className="app-container">
      {/* LEFT SIDEBAR: Search, Filters & Diagnostics */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>
            <Activity size={18} color="#3b82f6" />
            <span>MASAI Knowledge Graph</span>
          </h1>

          {/* View Selector Segments */}
          <div className="view-selector-tabs">
            {(['flat', 'module', 'service', 'api', 'data'] as const).map((mode) => (
              <button
                key={mode}
                className={`view-tab-btn ${viewMode === mode ? 'active' : ''}`}
                onClick={() => {
                  setViewMode(mode);
                  setActiveTraceStartId(null); // Clear active trace on view change
                  setSelectedNodeId(null);
                }}
              >
                {mode === 'flat' ? 'Flat' : mode === 'module' ? 'Modules' : mode === 'service' ? 'Services' : mode === 'api' ? 'APIs' : 'Data'}
              </button>
            ))}
          </div>
          
          <div className="search-container">
            <Search className="search-icon" size={16} />
            <input
              type="text"
              className="search-input"
              placeholder="Search symbols..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="sidebar-content">
          {/* Stats widget */}
          <div className="section-card">
            <div className="section-title">
              <span>Workspace Stats</span>
              <Activity size={14} color="var(--text-muted)" />
            </div>
            <div className="stats-grid">
              <div className="stat-box">
                <div className="stat-val">{model.fileCount}</div>
                <div className="stat-label">Files</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{model.symbolCount}</div>
                <div className="stat-label">Symbols</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{model.resolvedReferences.length}</div>
                <div className="stat-label">Resolved Refs</div>
              </div>
              <div className="stat-box" style={{ borderColor: model.diagnostics.length > 0 ? '#f59e0b' : 'var(--border-color)' }}>
                <div className="stat-val" style={{ color: model.diagnostics.length > 0 ? '#f59e0b' : 'var(--text-primary)' }}>
                  {model.diagnostics.length}
                </div>
                <div className="stat-label">Diagnostics</div>
              </div>
            </div>
          </div>

          {/* Symbol Filter Badges */}
          <div className="section-card">
            <div className="section-title">
              <span>Filter Symbols</span>
              <Layers size={14} color="var(--text-muted)" />
            </div>
            <div className="filters-list">
              {Object.entries(counts.kinds).map(([kind, count]) => {
                const { color } = getSymbolTheme(kind);
                const isChecked = selectedKinds.has(kind);
                return (
                  <div key={kind} className="filter-item" onClick={() => toggleKindFilter(kind)}>
                    <div className="filter-label">
                      <div className={`checkbox-custom ${isChecked ? 'checked' : ''}`}>
                        {isChecked && <Check size={10} color="white" />}
                      </div>
                      <div className="dot-indicator" style={{ backgroundColor: color }}></div>
                      <span style={{ textTransform: 'capitalize' }}>{kind.replace('_', ' ')}s</span>
                    </div>
                    <div className="count-badge">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Edge Filter Badges */}
          <div className="section-card">
            <div className="section-title">
              <span>Filter Relations</span>
              <ArrowRightLeft size={14} color="var(--text-muted)" />
            </div>
            <div className="filters-list">
              {Object.entries(counts.edges).map(([kind, count]) => {
                const isChecked = selectedEdgeKinds.has(kind);
                return (
                  <div key={kind} className="filter-item" onClick={() => toggleEdgeFilter(kind)}>
                    <div className="filter-label">
                      <div className={`checkbox-custom ${isChecked ? 'checked' : ''}`}>
                        {isChecked && <Check size={10} color="white" />}
                      </div>
                      <span style={{ textTransform: 'capitalize' }}>{kind.replace('_', ' ')}</span>
                    </div>
                    <div className="count-badge">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Diagnostics warning panel if warnings exist */}
          {model.diagnostics.length > 0 && (
            <div className="section-card" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
              <div className="section-title" style={{ color: '#f59e0b' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} />
                  Diagnostics ({model.diagnostics.length})
                </span>
              </div>
              <div className="file-list" style={{ gap: 10 }}>
                {model.diagnostics.map((diag, index) => (
                  <div key={index} className={`diagnostic-item ${diag.severity}`}>
                    <div className="diagnostic-header">
                      <span>{diag.kind.replace('_', ' ')}</span>
                      <span style={{ fontSize: 9, textTransform: 'uppercase', opacity: 0.8 }}>{diag.severity}</span>
                    </div>
                    <div className="diagnostic-msg">{diag.message}</div>
                    <div className="diagnostic-path">{diag.filePath}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick File List Navigator */}
          <div className="section-card">
            <div className="section-title">
              <span>Codebase Files</span>
              <FolderOpen size={14} color="var(--text-muted)" />
            </div>
            <div className="file-list">
              {model.symbols
                .filter((s) => s.kind === 'file')
                .map((file) => (
                  <div key={file.id} className="file-item" onClick={() => selectAndFocusNode(file.id)}>
                    <ChevronRight size={12} color="var(--text-muted)" />
                    <span>{file.name}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </aside>

      {/* CENTER: React Flow Canvas */}
      <main className="canvas-container">
        {activeTraceStartId && (
          <div
            style={{
              position: 'absolute',
              top: 20,
              left: 20,
              zIndex: 5,
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid #10b981',
              borderRadius: '24px',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 12.5,
              color: '#a7f3d0',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.35)',
            }}
          >
            <Activity size={14} color="#10b981" />
            <span>
              Flow Trace Active (Depth: <strong>{traceDepth}</strong>)
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setTraceDepth(d => d + 2)}
                className="action-btn"
                style={{ width: 'auto', padding: '2px 8px', fontSize: 11, background: 'rgba(255,255,255,0.1)' }}
              >
                +2 Depth
              </button>
              <button
                onClick={() => setTraceDepth(d => Math.max(2, d - 2))}
                className="action-btn"
                style={{ width: 'auto', padding: '2px 8px', fontSize: 11, background: 'rgba(255,255,255,0.1)' }}
              >
                -2 Depth
              </button>
              <button
                onClick={() => {
                  setActiveTraceStartId(null);
                  setTraceDepth(4);
                }}
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: '50%',
                  width: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  cursor: 'pointer',
                  marginLeft: 4,
                }}
                title="Reset Flow Trace"
              >
                <X size={10} />
              </button>
            </div>
          </div>
        )}

        {neighborhoodNodeId && (
          <div
            style={{
              position: 'absolute',
              top: activeTraceStartId ? 75 : 20,
              left: 20,
              zIndex: 5,
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid #3b82f6',
              borderRadius: '24px',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: '#93c5fd',
              backdropFilter: 'blur(10px)',
            }}
          >
            <span>Neighborhood isolation view active</span>
            <button
              onClick={() => setNeighborhoodNodeId(null)}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: '50%',
                width: 18,
                height: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              <X size={10} />
            </button>
          </div>
        )}

        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
          minZoom={0.05}
          maxZoom={2}
        >
          <Background color="#1e293b" gap={20} size={1} />
          <Controls style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
          <MiniMap
            style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
            nodeStrokeColor={(n) => {
              if (n.type === 'fileGroup') return 'var(--color-file)';
              if (n.type === 'classGroup') return 'var(--color-class)';
              return '#3b82f6';
            }}
            nodeColor={(n) => {
              if (n.type === 'fileGroup') return 'rgba(14, 165, 233, 0.05)';
              if (n.type === 'classGroup') return 'rgba(168, 85, 247, 0.05)';
              return '#0f172a';
            }}
          />
        </ReactFlow>
      </main>

      {/* RIGHT SIDEBAR: Symbol Details / Inspector */}
      <aside className="sidebar right">
        {selectedSymbol ? (
          <>
            <div className="sidebar-header">
              <div className="inspector-title-area">
                <div
                  className="inspector-kind-badge"
                  style={{ backgroundColor: getSymbolTheme(selectedSymbol.kind).color }}
                >
                  {selectedSymbol.kind}
                </div>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="inspector-name">{selectedSymbol.name}</div>
              <div className="inspector-qname">{selectedSymbol.qualifiedName}</div>
            </div>

            <div className="sidebar-content">
              {/* Properties Panel */}
              <div className="section-card">
                <div className="section-title">
                  <span>Symbol Details</span>
                  <Info size={14} color="var(--text-muted)" />
                </div>
                <div className="inspector-meta-row">
                  <span className="inspector-meta-label">File Location</span>
                  <span className="inspector-meta-val" title={selectedSymbol.filePath}>{selectedSymbol.filePath}</span>
                </div>
                <div className="inspector-meta-row">
                  <span className="inspector-meta-label">Visibility</span>
                  <span className="inspector-meta-val" style={{ textTransform: 'capitalize' }}>
                    {selectedSymbol.visibility}
                  </span>
                </div>
                <div className="inspector-meta-row">
                  <span className="inspector-meta-label">Exported</span>
                  <span className="inspector-meta-val">{selectedSymbol.exported ? 'Yes' : 'No'}</span>
                </div>
                <div className="inspector-meta-row">
                  <span className="inspector-meta-label">Source Range</span>
                  <span className="inspector-meta-val" style={{ fontFamily: 'monospace' }}>
                    L{selectedSymbol.range.start.line + 1}:{selectedSymbol.range.start.column} - L
                    {selectedSymbol.range.end.line + 1}:{selectedSymbol.range.end.column}
                  </span>
                </div>
                
                {/* Extensible metadata properties list */}
                {Object.entries(selectedSymbol.metadata || {}).map(([key, val]) => {
                  if (typeof val === 'object') return null;
                  return (
                    <div className="inspector-meta-row" key={key}>
                      <span className="inspector-meta-label" style={{ textTransform: 'capitalize' }}>{key}</span>
                      <span className="inspector-meta-val">{String(val)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Actions panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="action-btn" onClick={() => selectAndFocusNode(selectedSymbol.id)}>
                    <Focus size={16} />
                    Focus in Graph
                  </button>
                  <button
                    className={`action-btn secondary ${neighborhoodNodeId === selectedSymbol.id ? 'active' : ''}`}
                    onClick={() =>
                      setNeighborhoodNodeId(neighborhoodNodeId === selectedSymbol.id ? null : selectedSymbol.id)
                    }
                    style={{
                      borderColor: neighborhoodNodeId === selectedSymbol.id ? '#3b82f6' : 'var(--border-color)',
                    }}
                  >
                    <BookOpen size={16} />
                    Neighborhood
                  </button>
                </div>
                
                {selectedSymbol && (
                  <button
                    className="action-btn"
                    onClick={() => {
                      if (activeTraceStartId === selectedSymbol.id) {
                        setActiveTraceStartId(null);
                      } else {
                        setActiveTraceStartId(selectedSymbol.id);
                        setTraceDepth(4);
                      }
                    }}
                    style={{
                      backgroundColor: activeTraceStartId === selectedSymbol.id ? '#ef4444' : '#10b981',
                      color: 'white',
                    }}
                  >
                    <Activity size={16} />
                    {activeTraceStartId === selectedSymbol.id ? 'Stop Flow Trace' : 'Trace Execution Flow'}
                  </button>
                )}
              </div>

              {/* References Panel: Callers & Importers */}
              {selectedRelations && (
                <>
                  <div className="section-card">
                    <div className="section-title">
                      <span>Incoming Relations ({selectedRelations.referencesReceived.length})</span>
                      <ArrowRightLeft size={14} color="var(--text-muted)" />
                    </div>
                    {selectedRelations.referencesReceived.length > 0 ? (
                      <div className="inspector-relations-list">
                        {selectedRelations.referencesReceived.map(({ ref, sourceSymbol }) => (
                          <div
                            key={ref.candidateId}
                            className="inspector-relation-card"
                            onClick={() => selectAndFocusNode(sourceSymbol.id)}
                          >
                            <span className="relation-name">{sourceSymbol.name}</span>
                            <span className="relation-meta">{ref.kind}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
                        No incoming references resolved.
                      </div>
                    )}
                  </div>

                  <div className="section-card">
                    <div className="section-title">
                      <span>Outgoing Relations ({selectedRelations.referencesMade.length})</span>
                      <ArrowRightLeft size={14} color="var(--text-muted)" />
                    </div>
                    {selectedRelations.referencesMade.length > 0 ? (
                      <div className="inspector-relations-list">
                        {selectedRelations.referencesMade.map(({ ref, targetSymbol }) => (
                          <div
                            key={ref.candidateId}
                            className="inspector-relation-card"
                            onClick={() => selectAndFocusNode(targetSymbol.id)}
                          >
                            <span className="relation-name">{targetSymbol.name}</span>
                            <span className="relation-meta">{ref.kind}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
                        No outgoing references made.
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Collapsible legend at the bottom of detail panel */}
              <LegendSection />
            </div>
          </>
        ) : (
          <div className="inspector-empty" style={{ justifyContent: 'flex-start', padding: '40px 24px' }}>
            <Info size={36} color="var(--text-muted)" style={{ margin: '0 auto 16px auto' }} />
            <div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontFamily: 'var(--font-title)' }}>Symbol Inspector</h3>
              <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>
                Click a node on the canvas, or search for symbols, to inspect detailed code structure and relations.
              </p>
            </div>
            <LegendSection />
          </div>
        )}
      </aside>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <VisualizerDashboard />
    </ReactFlowProvider>
  );
}
