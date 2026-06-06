# MASAI Knowledge Graph (MASAI-KG)

MASAI-KG is a high-fidelity static analysis pipeline designed to process multi-language codebases (TypeScript/JavaScript, Python, and Java). It constructs a unified, language-agnostic semantic model, resolves imports and reference linkages without requiring full type inference, and exposes a queryable graph API optimized for developer agents and LLM contexts.

## Core Features

- **Multi-Language Parsing**: Utilizes native Tree-sitter bindings for accurate parsing of TypeScript, TSX, JavaScript, JSX, Python, and Java.
- **Declarative Fact Extraction**: Extracts structural elements and usages using declarative Tree-sitter S-expression queries.
- **Dynamic Scope Indexing**: Resolves lexical scopes dynamically by evaluating syntax node range containment rather than using complex AST traversal trees.
- **Two-Phase Reference Resolution**: Decouples import path mapping from lexical variable and member lookup to avoid resolution order cycles.
- **Agent-Ready Graph API**: Supports graph traversal operations, including localized Breadth-First Search (BFS) neighborhood extraction to construct compact subgraphs for LLM context windows.

## Installation

Ensure you have Node.js (version 20 or higher) installed on your system.

Install the dependencies:

```bash
npm install
```

## CLI & Execution Commands

### 1. Running the Parser Pipeline

The CLI parses a target codebase, builds a semantic model, prints a diagnostic report, and persists the serialized JSON model.

#### Running in Development (JIT Compilation)

```bash
npm run dev -- <path-to-target-project>
```

*If no path is specified, the pipeline defaults to the current working directory.*

#### Production Build & Run

To compile the production ESM bundle and type declarations:

```bash
npm run build
```

Then run the compiled script using:

```bash
node dist/index.js <path-to-target-project>
```

#### Serialized Artifact

The pipeline persists the finalized semantic model to:
```
<path-to-target-project>/.masai/semantic-model.json
```

---

### 2. Running the Interactive Visualizer

The visualizer provides a web-based, interactive 2D node-link graph visualization of the extracted knowledge graph, including a details inspector and neighborhood search.

#### Prerequisite: Build the Frontend Assets
Before running the server, build the production visualizer assets:

```bash
cd visualizer
npm install
npm run build
cd ..
```

#### Start the Server
Start the local HTTP server to load the serialized model and host the visualizer:

```bash
npm run serve -- <path-to-target-project>
```
*Note: This command will attempt to automatically open your default browser at `http://localhost:3000` (or the next available port).*

#### Running in Frontend Development Mode (with Hot Reloading)
If you are developing the visualizer UI and want Hot Module Replacement (HMR):

1. **Start the backend server** in the root directory to serve the API on port 3000:
   ```bash
   npm run serve -- <path-to-target-project>
   ```
2. **Start the Vite development server** in a separate terminal:
   ```bash
   cd visualizer
   npm run dev
   ```
   *This serves the frontend UI at `http://localhost:5173` and proxies API requests to the backend server.*

---

## Programmatic API Usage

MASAI-KG can be integrated directly into other node applications.

```typescript
import { Pipeline } from './src/pipeline.ts';
import { JsonSemanticModelStorage } from './src/storage/semantic-model-storage.ts';

async function main() {
  const projectPath = './my-target-project';
  const pipeline = new Pipeline();

  // 1. Run the static analysis pipeline
  const model = await pipeline.buildFull(projectPath);

  console.log(`Files parsed: ${model.fileCount}`);
  console.log(`Total symbols extracted: ${model.symbolCount}`);
  console.log(`Resolved references: ${model.resolvedReferences.length}`);

  // 2. Persist the semantic model to .masai/semantic-model.json
  const storage = new JsonSemanticModelStorage();
  await storage.save(model, projectPath);

  // 3. Derive the queryable knowledge graph
  const graph = pipeline.deriveGraph(model);

  // Example: Find callers of a specific function
  const callers = graph.getCallersOf('src/auth.ts::login');
  console.log('Callers of login():', callers.map(node => node.id));

  // Example: Extract a localized neighborhood subgraph for an LLM context
  const localGraph = graph.getNeighborhood('src/auth.ts::login', 2);
  console.log(`Neighborhood size: ${localGraph.stats().nodes} nodes`);
}

main();
```

---

## Codebase Architecture

The pipeline consists of the following modules:

- **[src/index.ts](file:///c:/Users/Juveria/Desktop/masai%20-kg/src/index.ts)**: CLI executable script and library entry point.
- **[src/pipeline.ts](file:///c:/Users/Juveria/Desktop/masai%20-kg/src/pipeline.ts)**: Main orchestration driver managing transition between execution stages.
- **[src/stage1-parse/](file:///c:/Users/Juveria/Desktop/masai%20-kg/src/stage1-parse/)**: Reads workspace files, filters paths against custom `.gitignore` patterns, and constructs AST structures using tree-sitter.
- **[src/stage2-extract/](file:///c:/Users/Juveria/Desktop/masai%20-kg/src/stage2-extract/)**: Matches S-expression queries against ASTs and normalizes captured facts into file-level semantic models.
- **[src/stage3-registry/](file:///c:/Users/Juveria/Desktop/masai%20-kg/src/stage3-registry/)**: Constructs indexing structures for symbols, modules, files, and lexical scopes.
- **[src/stage4-resolve/](file:///c:/Users/Juveria/Desktop/masai%20-kg/src/stage4-resolve/)**: Resolves imports and links calls/uses to declaration nodes across scopes and packages.
- **[src/stage5-graph/](file:///c:/Users/Juveria/Desktop/masai%20-kg/src/stage5-graph/)**: Exposes the queryable property graph API.
- **[src/semantic-model/](file:///c:/Users/Juveria/Desktop/masai%20-kg/src/semantic-model/)**: Defines types, builders, and helpers for model serialization and merge operations.
- **[src/storage/](file:///c:/Users/Juveria/Desktop/masai%20-kg/src/storage/)**: Handles saving and loading the semantic model JSON to disk.

For an in-depth analysis of the system architecture, algorithms, and data structures, refer to **[deep_dive_architecture.md](file:///c:/Users/Juveria/Desktop/masai%20-kg/deep_dive_architecture.md)**.

---

## Running Tests

Automated unit and integration tests are executed using Vitest.

To run the test suite:

```bash
npm test
```

To run tests in watch mode:

```bash
npm run test:watch
```
