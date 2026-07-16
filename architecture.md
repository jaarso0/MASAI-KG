# MASAI-KG — Architecture Overview

MASAI-KG turns a codebase into a queryable knowledge graph and exposes it two ways: as an **MCP server** for AI coding agents (structural queries with exact callsites and confidence tags) and as an **interactive visualizer** (React Flow graph explorer). Everything downstream is derived from one pipeline: parse → extract → merge → index → resolve → graph.

```
                    ┌────────────────────────────────────────────────────────────┐
                    │                    BUILD PIPELINE (Pipeline.buildFull)      │
                    │                                                              │
  filesystem  ──▶  walker.ts  ──▶  extract.ts  ──▶  merge.ts  ──▶  registry.ts    │
  (gitignore-      (tree-sitter    (S-expr query     (per-file      (symbol/scope │
   aware walk)      parse per      → normalized       partials →    lookup maps) │
                     language)      captures)          one model)                 │
                    │                                                    │         │
                    │                                                    ▼         │
                    │                                          resolver.ts         │
                    │                                    (imports, then scope/     │
                    │                                     instance-type/fallback)  │
                    └────────────────────────────────────────┬───────────────────┘
                                                               ▼
                                                    SemanticModel (JSON, persisted
                                                    to .masai/semantic-model.json)
                                                               │
                                            buildGraphFromModel (graph.ts)
                                                               │
                                                               ▼
                                                       KnowledgeGraph
                                        (in-memory nodes + edges, held by whichever
                                         process derived it — MCP server, visualizer
                                         backend, or a one-off CLI run)
                          ┌────────────────────────────┼────────────────────────────┐
                          ▼                             ▼                             ▼
                  MCP SERVER STACK              RETRIEVAL LAYER                VISUALIZER
              (fine-grained agent tools)   (task-query → context package)   (React Flow UI)
```

---

## 1. Build Pipeline (`Pipeline.buildFull`, [src/pipeline.ts](src/pipeline.ts))

Six sequential stages, all invoked from one orchestrator method. Re-run in full on every MCP server startup (never trusts a cached model on boot — see [Known Issues](#known-issues--limitations)) and again on every file-change event via the watcher.

### Stage 1 — Walk & Parse ([src/parse/walker.ts](src/parse/walker.ts), [src/parse/parser-registry.ts](src/parse/parser-registry.ts))
- `parseProject(root)` recursively walks the directory, respecting a hardcoded exclude set (`node_modules`, `dist`, `.git`, venvs...) plus `.gitignore` rules (parsed into regex by a small `GitIgnoreMatcher`).
- Each supported file (`.ts .tsx .js .jsx .py .java .html`) is read and parsed via `ParserRegistry.getParser(lang)`, which lazily instantiates and caches one tree-sitter `Parser` per language.
- Output: `ParsedFile[]` — `{ filePath, absolutePath, language, tree, sourceCode }`. Per-file parse failures are logged and skipped, not fatal.

### Stage 2 — Declarative Extraction ([src/extract/extract.ts](src/extract/extract.ts))
`extractPartialModel(parsed)` per file:
1. **`runTreeSitterQuery`** ([src/extract/query-runner.ts](src/extract/query-runner.ts)) — runs the language's S-expression query set (`QUERY_REGISTRY`) against the AST, producing a flat `Capture[]` (`{ tag, name, node, nameNode }`) — tags like `definition.class`, `call`, `import`, `inherit`, `type_use`.
2. **`normalizeCaptures`** ([src/extract/capture-normalizer.ts](src/extract/capture-normalizer.ts)) — the core of extraction:
   - Sorts captures by position so parents are processed before children.
   - `ContextTracker` (parallel scope/symbol stacks) keeps the current containing scope/symbol in sync as captures are walked (`syncContext`).
   - `definition.*` tags become `Symbol` records (class/function/method/etc.), with a `has_member`/`owns` containment edge to the parent. Non-top-level `variable` definitions are *not* promoted to full symbols (avoids polluting name search) — instead recorded as `LocalTypeBinding`s so `localVar.method()` calls can still resolve.
   - `call`/`new`/`import`/`inherit`/`implement`/`type_use` tags become `ReferenceCandidate`s (unresolved at this stage), with language-specific import-path extraction.
   - **Framework adapters** ([src/frameworks/](src/frameworks/)) run here per definition: pluggable detectors for FastAPI/Flask/NestJS/Express that tag symbols with `apiRoute`, `dataModel`, or `isService` metadata, feeding the API/Data/Service visualizer views.
   - `error` captures become parse-error diagnostics.

### Stage 2.5 — Merge ([src/semantic-model/merge.ts](src/semantic-model/merge.ts))
`mergePartials(partials, projectSymbol)` consolidates all per-file `PartialSemanticModel`s into one `MergeableModel`, adding `Project CONTAINS File` containment edges.

### Stage 3 — Symbol Registry ([src/registry/registry.ts](src/registry/registry.ts))
`SymbolRegistry.build(merged)` builds multi-map indexes (by ID, by name, by qualified name, by file, plus a `ScopeIndex`) used by the resolver for fast lookup during reference resolution.

### Stage 4 — Reference Resolution ([src/resolve/resolver.ts](src/resolve/resolver.ts))
`resolveAll(references, registry, containments)` — two-phase:
1. **Import resolution** ([src/resolve/import-resolver.ts](src/resolve/import-resolver.ts)) — resolves file-level import statements to their target module/symbol.
2. **Scope resolution** ([src/resolve/scope-resolver.ts](src/resolve/scope-resolver.ts)) — walks lexical scope outward from the reference site, falls back to instance-type tracking (via `LocalTypeBinding`s) and finally a global name-match fallback.

Every resolved reference carries a `resolutionMethod` (`import` / `scope` / `qualified_name` / `global_fallback`) — this is the basis for the confidence tags surfaced everywhere downstream. Unresolved references are kept, not dropped, so callers can see where the graph's picture is incomplete.

**Known resolver limitations** (documented, not silent gaps):
- `this.field.method()` chains: `this` is treated as a literal identifier, so these fall back to low-confidence or unresolved.
- Dynamic dispatch via runtime registries (e.g. Python `HANDLERS[key](...)`) can't be resolved statically at all.

### Stage 5 — Graph Derivation ([src/graph/graph.ts](src/graph/graph.ts))
`buildGraphFromModel(model)` — the final assembly step, unconditionally maps *every* `model.symbols` entry to a `KGNode`, every containment/resolved-reference to a `KGEdge` (carrying `resolutionMethod`), indexes unresolved references per source symbol, and heuristically flags symbols as test-covered when a resolved reference to them originates from a file matching test-path conventions.

Output: a `KnowledgeGraph` — in-memory adjacency maps (`edgesFrom`, `edgesTo`), no filtering happens at this step, so anything present in `model.symbols` is guaranteed to be a graph node.

### Persistence ([src/storage/semantic-model-storage.ts](src/storage/semantic-model-storage.ts))
`JsonSemanticModelStorage` serializes the `SemanticModel` to `<project>/.masai/semantic-model.json`. This is a cache for the CLI analysis mode and for `scratch/query.ts` — **the MCP server does not read from it on startup**, it always rebuilds fresh (see below).

---

## 2. MCP Server Stack ([src/mcp/](src/mcp/), [src/resolution/](src/resolution/), [src/executor/](src/executor/), [src/evidence/](src/evidence/), [src/optimizer/](src/optimizer/))

Exposes five tools over JSON-RPC/stdio: `search_symbols`, `explore_region`, `trace_path`, `analyze_impact`, `query_graph`.

```
MCPServer.handleToolCall
  │  (dispatches on toolName, compiles args → GraphQueryPlan via src/mcp/compile.ts)
  │  validateGraphQueryPlan (src/mcp/schemas.ts)
  ▼
RequestController.processPlan(plan)          [src/mcp/controller.ts]
  │
  ├─ 1. AnchorResolver.resolveAll(plan.anchors)        — see below
  │      not_found  → return error immediately
  │      ambiguous  → return candidate list immediately (unless searchMode, then
  │                   flatten into a search-style success result)
  │      resolved   → continue
  │
  ├─ 2. GraphExecutor.execute(planWithResolvedAnchors)  — BFS/path/impact traversal
  │      bounded by DEFAULT_POLICY.graph.{maxDepth,maxNodes,maxPaths}
  │
  ├─ 3. EvidenceMaterializer.materialize(structuralResult, plan)
  │      batch file reads + line-range slicing for source/signature/docs
  │
  └─ 4. QueryContextOptimizer.optimize(plan, structuralResult, evidence)
         — see below, produces the final ContextPackage
```

### Anchor Resolution ([src/resolution/anchor-resolver.ts](src/resolution/anchor-resolver.ts))
`resolveAnchor(spec)` is a waterfall, each step short-circuiting on 1 match (resolved) or >1 match (ambiguous, returned immediately without falling through):
1. **Exact node ID lookup** — `graph.getNode(query)`.
2. **Case-insensitive qualified-name match**.
3. **Case-insensitive symbol-name match**.
4. **FTS/discovery search** — delegates to `CandidateDiscovery` (the same engine the retrieval layer uses), only reached if modes 1–3 found nothing or `resolution: 'search'` was explicitly requested.

This is why loosely-worded queries (a bare name shared by several symbols) come back `ambiguous` rather than guessing — the caller gets the candidate list and re-queries with an exact `nodeId`.

### Graph Execution ([src/executor/graph-executor.ts](src/executor/graph-executor.ts), [src/executor/operations/](src/executor/operations/))
Runs the actual `region` (BFS neighborhood) / `path` (shortest path) / `impact` (bounded dependency cone) traversal against the resolved anchors, capped by policy limits to prevent runaway output on a heavily-connected symbol.

### Context Optimization ([src/optimizer/query-context-optimizer.ts](src/optimizer/query-context-optimizer.ts))
Packs the traversal result into a token-budgeted `ContextPackage`:
1. **`allocateBudget`** ([src/optimizer/budget-allocator.ts](src/optimizer/budget-allocator.ts)) — per-node representation level (`OMIT`/`SIGNATURE`/`SNIPPET`/`FULL`), starts everyone at `SIGNATURE`, then either downgrades (over budget) or greedily upgrades (under budget) by `structuralRole` priority. Token estimate is `chars / 4` computed from real body size.
2. **`mergeSpans`** ([src/optimizer/span-merger.ts](src/optimizer/span-merger.ts)) — merges near-adjacent line ranges (within 5 lines) per file to avoid duplicate/overlapping code blocks.
3. **Serialization** — one of `serializeRegion` / `serializePath` / `serializeImpact` ([src/optimizer/serializers/](src/optimizer/serializers/)), each emitting confidence-annotated text (`resolved-via: scope` vs `⚠ low-confidence: name-only match`), test-coverage flags, and a "Recommended Code Ranges to Read Next" index. `serializeRegion` caps relationship lines at 60 (root-touching edges prioritized) to avoid pathological blowups on hub symbols.
4. **Hard size backstop** — a `HARD_OUTPUT_CHAR_CAP` truncates the final string as a last resort if the above still produces something too large, with an explicit "narrow your query" message.

### Live Updates
`watchAndRebuild` ([src/watcher.ts](src/watcher.ts)) debounces (1000ms) filesystem changes, reruns the full pipeline, and swaps the MCP server's in-memory graph via `MCPServer.updateGraph(newGraph)` — which also rebuilds `RequestController` (and therefore `AnchorResolver`, `GraphExecutor`, etc.) against the new graph.

---

## 3. Retrieval Layer ([src/retrieval/](src/retrieval/))

A separate, coarser-grained facade — takes a raw natural-language task query and returns a ready-to-use `ContextPackage` in one call, distinct from the MCP tools' precise anchor-based queries.

```
RetrievalEngine.retrieveContext(taskQuery)
  │
  ├─ 1. RetrievalPlanner.plan(taskQuery)
  │      keyword-scores the query against locate/flow/impact keyword sets, picks
  │      the highest-scoring strategy (impact > flow > locate on ties)
  │
  ├─ 2. CandidateDiscovery.discover(taskQuery)
  │      tokenizes the query; matches against byEndpoint / byService / bySymbolName /
  │      byQualifiedName / byFile indexes; re-ranks with multi-term co-occurrence
  │      boost, file co-location boost, brevity bonus, and a 0.3x demotion for
  │      peripheral (test/fixture) files unless the query explicitly asks for them
  │
  ├─ 3. dispatch to LocateRetriever / FlowRetriever / ImpactRetriever
  │      (by planned strategy) — each expands the candidate nodes into a subgraph
  │      via GraphExpander
  │
  └─ 4. ContextBuilder.build(task, strategy, nodes, edges)
         filters out project/file-kind nodes, collects file list, extracts real
         code snippets per symbol, and — only for 'flow' strategy — reconstructs
         a step-by-step executionFlows array
```

This is the same `CandidateDiscovery` engine `AnchorResolver`'s step 4 falls back to — the FTS/fuzzy-matching logic is shared between the MCP tools and the retrieval layer.

---

## 4. Visualizer ([visualizer/](visualizer/), [src/serve.ts](src/serve.ts))

### Backend — `startServer(targetPath)` ([src/serve.ts](src/serve.ts))
A raw `http.Server` (no framework):
- Locates and loads `.masai/semantic-model.json` (checking a few candidate paths).
- `GET /api/model` serves the raw semantic model JSON.
- Static file serving from `visualizer/dist` with path-traversal protection and SPA fallback (unmatched routes serve `index.html`).
- Port search 3000–3009 on `EADDRINUSE`, auto-opens the OS default browser on success.

### Frontend — `App.tsx` → `VisualizerDashboard` → view builders ([visualizer/src/utils/graph-builder.ts](visualizer/src/utils/graph-builder.ts))
Fetches `/api/model`, then picks one of several graph-construction functions depending on view mode. All share a synchronous D3-force layout pass (~250 ticks, computed once, not live physics) before conversion to React Flow `RFNode`/`RFEdge`:

| Function | View | Nodes | Edges |
|---|---|---|---|
| `buildGraph` | Flat | all non-project symbols | containments + resolved references, kind-colored |
| `buildModuleGraph` | Module | files | cross-file reference dependencies |
| `buildServiceGraph` | Service | classes tagged `isService`/named `*Service` | inter-service calls, with member calls rolled up to their owning service |
| `buildApiGraph` | API | virtual `api_route` nodes (from `metadata.apiRoute`) | route → handler |
| `buildDataGraph` | Data | services ↔ DB models (`metadata.dataModel`) | access edges, attributed to the containing service |
| `traceFlow` | Flow trace | BFS from a chosen start symbol to a given depth | recursive call chain, method calls rolled up to owning service |

---

## 5. Known Issues & Limitations

- **Resolver gaps** (by design, documented upstream): `this.field.method()` chains and dynamic-dispatch-via-registry calls aren't resolved statically — see Stage 4 above.
- **Live MCP server graph can go stale relative to disk.** Confirmed during this session's investigation: `visualizer/src/App.tsx`'s symbols (`VisualizerDashboard`, `LegendSection`, etc.) are present and correctly extracted in `.masai/semantic-model.json` on disk, and `buildGraphFromModel` does not filter any symbols out — yet a live-connected MCP server session could not resolve `VisualizerDashboard` via `search_symbols` (exact name/qualifiedName match, which should have hit unconditionally). This points to the running server's in-memory `KnowledgeGraph` predating the on-disk model — i.e. either the file watcher's debounced rebuild silently failed to fire/complete for that file, or the connected server process was started before the file reached its current state and hasn't received an `updateGraph` swap since. A code comment in `src/index.ts`'s startup path explicitly documents having fixed a near-identical staleness bug before ("a restarted server could inherit a stale index... so restarts didn't reliably pick up code/source changes") — this suggests the same class of bug resurfaced at the live-watcher level rather than the startup level. **Not yet root-caused to a specific line** — next step would be instrumenting `watchAndRebuild`'s rebuild/`onRebuilt` callback to confirm whether it's firing and completing for changes under `visualizer/`.
- **TSX/JSX call-graph coverage is weaker than the plain-TS backend.** masai-kg's static call-graph does not appear to represent JSX component rendering (`<VisualizerDashboard />`) as a call/reference edge the way it does explicit function calls — so tools like `explore_region`/`trace_path` can't see the `App → VisualizerDashboard → LegendSection` render chain even when all three symbols are individually indexed. (For comparison, a separate tool used during this investigation — CodeGraph — does synthesize these as "dynamic: renders `<X>`" edges; that's the concrete gap to close if JSX-aware tracing is wanted here too.)
