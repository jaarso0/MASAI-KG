#!/usr/bin/env node

import * as path from 'path';
import { Pipeline } from './pipeline.js';
import { JsonSemanticModelStorage } from './storage/semantic-model-storage.js';

import { startServer } from './serve.js';

// Export everything for programmatic use
export { Pipeline } from './pipeline.js';
export { JsonSemanticModelStorage } from './storage/semantic-model-storage.js';
export * from './semantic-model/types.js';
export { KnowledgeGraph } from './graph/graph.js';
export { startServer } from './serve.js';
export { RetrievalEngine } from './retrieval/api.js';
export * from './retrieval/types.js';

// CLI Execution Support
async function runCLI() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'serve' || command === 'visualize') {
    const targetDir = args[1] ? path.resolve(args[1]) : process.cwd();
    try {
      await startServer(targetDir);
    } catch (err: any) {
      console.error(`\n❌ Error starting server:`, err.message || err);
      process.exit(1);
    }
    return;
  }

  if (command === 'mcp') {
    const targetDir = args[1] ? path.resolve(args[1]) : process.cwd();
    try {
      const storage = new JsonSemanticModelStorage();
      const pipeline = new Pipeline();
      // Always rebuild on startup rather than trusting the cached model file. Loading a
      // cached model meant a restarted server could inherit a stale index — including one
      // another (older-code) instance had clobbered onto disk — so restarts didn't reliably
      // pick up code/source changes. A full build is a few seconds for typical repos and
      // guarantees the served graph matches the current code and current source.
      console.error(`Building semantic model for ${targetDir} on startup...`);
      const model = await pipeline.buildFull(targetDir);
      await storage.save(model, targetDir);
      const graph = pipeline.deriveGraph(model);
      const { MCPServer } = await import('./mcp/server.js');
      const mcpServer = new MCPServer(graph, targetDir);
      mcpServer.start();

      const { watchAndRebuild } = await import('./watcher.js');
      const watcher = watchAndRebuild(targetDir, (newGraph) => {
        mcpServer.updateGraph(newGraph);
      });
      process.on('exit', () => watcher.close());
    } catch (err: any) {
      console.error(`\n❌ Error starting MCP server:`, err.message || err);
      process.exit(1);
    }
    return;
  }

  const targetDir = args[0] ? path.resolve(args[0]) : process.cwd();

  console.log(`\n==================================================`);
  console.log(` MASAI Knowledge Graph Builder v1.0.0`);
  console.log(`==================================================`);
  console.log(`Target Directory : ${targetDir}`);
  console.log(`Starting analysis...\n`);

  const startTime = Date.now();
  const pipeline = new Pipeline();

  try {
    const model = await pipeline.buildFull(targetDir);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✓ Analysis completed successfully in ${duration}s!`);
    console.log(`--------------------------------------------------`);
    console.log(`Files Processed  : ${model.fileCount}`);
    console.log(`Total Symbols    : ${model.symbolCount}`);
    console.log(`Resolved Refs    : ${model.resolvedReferences.length}`);
    console.log(`Diagnostics/Warns: ${model.diagnostics.length}`);

    // Persist model
    const storage = new JsonSemanticModelStorage();
    await storage.save(model, targetDir);
    console.log(`\nSaved semantic model to:`);
    console.log(`  ${path.join(targetDir, '.masai', 'semantic-model.json')}`);

    // Derive graph stats
    const graph = pipeline.deriveGraph(model);
    const stats = graph.stats();
    console.log(`\nDerived Knowledge Graph stats:`);
    console.log(`  Total Nodes: ${stats.nodes}`);
    console.log(`  Total Edges: ${stats.edges}`);
    console.log(`  Edges by Kind:`);
    for (const [kind, count] of Object.entries(stats.byKind)) {
      console.log(`    - ${kind}: ${count}`);
    }
    console.log(`==================================================\n`);
  } catch (err: any) {
    console.error(`\n❌ Error during analysis:`, err.message || err);
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
const currentFilePath = path.resolve(process.argv[1] || '');
const isExecutedDirectly =
  currentFilePath.endsWith('index.ts') ||
  currentFilePath.endsWith('index.js') ||
  currentFilePath.endsWith('index.mjs');

if (isExecutedDirectly) {
  runCLI();
}
