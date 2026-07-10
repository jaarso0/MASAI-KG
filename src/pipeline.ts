import * as path from 'path';
import { parseProject } from './parse/walker.js';
import { extractorRegistry } from './extract/extractor-registry.js';
import { createSymbol } from './semantic-model/builder.js';
import { mergePartials } from './semantic-model/merge.js';
import { SymbolRegistry } from './registry/registry.js';
import { resolveAll } from './resolve/resolver.js';
import { buildGraphFromModel, KnowledgeGraph } from './graph/graph.js';
import { SemanticModel } from './semantic-model/types.js';

export class Pipeline {
  public async buildFull(projectRoot: string): Promise<SemanticModel> {
    const resolvedRoot = path.resolve(projectRoot);
    const projectName = path.basename(resolvedRoot) || 'root-project';

    // 1. Create project root symbol
    const project = createSymbol({
      filePath: '',
      chain: [projectName],
      kind: 'project',
      range: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
    });

    // 2. Stage 1: Parse
    const parsedFiles = await parseProject(resolvedRoot);

    // 3. Stage 2: Extract (per-file PartialSemanticModel)
    const partials = parsedFiles.map(file => {
      const extractor = extractorRegistry.getExtractor(file.language);
      return extractor.extract(file);
    });

    // 4. Merge Partials (includes Project CONTAINS File edges)
    const merged = mergePartials(partials, project);

    // 5. Stage 3: Registry (includes ScopeIndex)
    const registry = new SymbolRegistry();
    registry.build(merged);

    // 6. Stage 4: Resolve
    const { resolved, unresolved, diagnostics } = resolveAll(
      merged.references,
      registry,
      merged.containments
    );

    // 7. Assemble final SemanticModel
    return {
      project,
      symbols: merged.symbols,
      scopes: merged.scopes,
      containments: merged.containments,
      resolvedReferences: resolved,
      unresolvedReferences: unresolved,
      diagnostics: [...merged.diagnostics, ...diagnostics],
      projectRoot: resolvedRoot.replace(/\\/g, '/'),
      createdAt: new Date().toISOString(),
      fileCount: parsedFiles.length,
      symbolCount: merged.symbols.length
    };
  }

  /**
   * NOT incremental, despite the name/signature. A prior attempt built a `MergeableModel`
   * patch here via `updatePartial` (see merge.ts) but discarded it and fell back to a full
   * rebuild anyway. True incremental resolution is unsound in general: a change in one file
   * can invalidate cross-file references that were resolved via `global_fallback`/
   * `qualified_name` in unrelated files, so a partial patch risks leaving stale, silently-
   * wrong edges in the graph. `updatePartial` correctly implements the patch mechanics if
   * this is ever revisited — see deep_dive_architecture.md for the full reasoning. Kept as a
   * thin alias for API compatibility with existing callers.
   */
  public async rebuildFile(
    projectRoot: string,
    _filePath: string,
    _currentModel: SemanticModel
  ): Promise<SemanticModel> {
    return this.buildFull(projectRoot);
  }

  public deriveGraph(model: SemanticModel): KnowledgeGraph {
    return buildGraphFromModel(model);
  }
}
