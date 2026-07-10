import { ParsedFile } from '../parse/parsed-file.js';
import { PartialSemanticModel } from '../semantic-model/types.js';
import { QUERY_REGISTRY } from './queries/index.js';
import { runTreeSitterQuery } from './query-runner.js';
import { normalizeCaptures } from './capture-normalizer.js';

/**
 * Orchestrates Stage 2 (Extraction) by running the appropriate tree-sitter queries
 * and normalizing the resulting captures into a PartialSemanticModel.
 */
export function extractPartialModel(parsed: ParsedFile): PartialSemanticModel {
  const querySource = QUERY_REGISTRY[parsed.language];
  if (!querySource) {
    return {
      filePath: parsed.filePath,
      symbols: [],
      scopes: [],
      containments: [],
      references: [],
      diagnostics: [],
      localTypeBindings: []
    };
  }

  const captures = runTreeSitterQuery(parsed.tree, parsed.language, querySource);
  const normalized = normalizeCaptures(captures, parsed.filePath, parsed.tree.rootNode);

  return {
    filePath: parsed.filePath,
    symbols: normalized.symbols,
    scopes: normalized.scopes,
    containments: normalized.containments,
    references: normalized.references,
    diagnostics: normalized.diagnostics,
    localTypeBindings: normalized.localTypeBindings
  };
}
