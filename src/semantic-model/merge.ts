import {
  Symbol,
  Scope,
  Containment,
  ReferenceCandidate,
  PartialSemanticModel,
  Diagnostic,
  LocalTypeBinding
} from './types.js';
import { createSymbol, createContainment } from './builder.js';

export interface MergeableModel {
  symbols: Symbol[];
  scopes: Scope[];
  containments: Containment[];
  references: ReferenceCandidate[];
  diagnostics: Diagnostic[];
  localTypeBindings: LocalTypeBinding[];
}

/**
 * Merges a list of PartialSemanticModels from each file into a single global model.
 * Adds a project symbol as the root and containment links from the project to all files.
 */
export function mergePartials(
  partials: PartialSemanticModel[],
  projectSymbol: Symbol
): MergeableModel {
  const symbols: Symbol[] = [projectSymbol];
  const scopes: Scope[] = [];
  const containments: Containment[] = [];
  const references: ReferenceCandidate[] = [];
  const diagnostics: Diagnostic[] = [];
  const localTypeBindings: LocalTypeBinding[] = [];

  for (const partial of partials) {
    const filePath = partial.filePath.replace(/\\/g, '/');

    // Find or create the file symbol if not already present in the partial symbols
    let fileSymbol = partial.symbols.find(s => s.kind === 'file' && s.filePath === filePath);
    if (!fileSymbol) {
      // Create a default file symbol if the extractor didn't emit one
      fileSymbol = createSymbol({
        filePath,
        chain: [filePath],
        kind: 'file',
        range: {
          start: { line: 0, column: 0 },
          end: { line: 100000, column: 0 } // dummy large range for file container
        },
        exported: true,
        visibility: 'public'
      });
      symbols.push(fileSymbol);
    }

    // Project CONTAINS File edge
    containments.push(createContainment(projectSymbol.id, fileSymbol.id, 'owns'));

    // Append all other elements from the partial
    for (const sym of partial.symbols) {
      // Ensure we don't duplicate the file symbol if we already pushed it
      if (sym.id === fileSymbol.id) {
        if (!symbols.some(s => s.id === sym.id)) {
          symbols.push(sym);
        }
      } else {
        symbols.push(sym);
      }
    }

    scopes.push(...partial.scopes);
    containments.push(...partial.containments);
    references.push(...partial.references);
    diagnostics.push(...partial.diagnostics);
    localTypeBindings.push(...(partial.localTypeBindings ?? []));
  }

  return {
    symbols,
    scopes,
    containments,
    references,
    diagnostics,
    localTypeBindings
  };
}

/**
 * Incremental update helper. Removes old entries matching a file path, then adds the new one.
 */
export function updatePartial(
  current: MergeableModel,
  filePath: string,
  newPartial: PartialSemanticModel | null, // null means the file was deleted
  projectSymbol: Symbol
): MergeableModel {
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Filter out all old records associated with this file path
  // Note: we preserve the project symbol, and any containments that are not related to this file.
  const filteredSymbols = current.symbols.filter(
    s => s.id !== projectSymbol.id && s.filePath !== normalizedPath
  );
  const filteredScopes = current.scopes.filter(s => s.filePath !== normalizedPath);
  const filteredContainments = current.containments.filter(c => {
    // If it's a project -> file edge, check if the file symbol is the target
    const isProjectEdge = c.parentId === projectSymbol.id;
    if (isProjectEdge) {
      // Find the file symbol being removed
      const targetSymbol = current.symbols.find(s => s.id === c.childId);
      if (targetSymbol && targetSymbol.filePath === normalizedPath) {
        return false;
      }
    }
    // General symbol-level containments: check if the parent or child is in the removed file
    const parentSym = current.symbols.find(s => s.id === c.parentId);
    const childSym = current.symbols.find(s => s.id === c.childId);
    if (parentSym && parentSym.filePath === normalizedPath) return false;
    if (childSym && childSym.filePath === normalizedPath) return false;
    return true;
  });
  const filteredReferences = current.references.filter(r => r.filePath !== normalizedPath);
  const filteredDiagnostics = current.diagnostics.filter(d => d.filePath !== normalizedPath);
  const filteredLocalTypeBindings = (current.localTypeBindings ?? []).filter(b => b.filePath !== normalizedPath);

  const nextModel: MergeableModel = {
    symbols: [projectSymbol, ...filteredSymbols],
    scopes: filteredScopes,
    containments: filteredContainments,
    references: filteredReferences,
    diagnostics: filteredDiagnostics,
    localTypeBindings: filteredLocalTypeBindings
  };

  if (newPartial) {
    // Merge the single new partial in
    const mergedNew = mergePartials([newPartial], projectSymbol);

    // Append symbols, scopes, containments, references, diagnostics
    // (Skip project symbol since we already have it)
    for (const sym of mergedNew.symbols) {
      if (sym.id !== projectSymbol.id && !nextModel.symbols.some(s => s.id === sym.id)) {
        nextModel.symbols.push(sym);
      }
    }
    nextModel.scopes.push(...mergedNew.scopes);
    nextModel.containments.push(...mergedNew.containments);
    nextModel.references.push(...mergedNew.references);
    nextModel.diagnostics.push(...mergedNew.diagnostics);
    nextModel.localTypeBindings.push(...mergedNew.localTypeBindings);
  }

  return nextModel;
}
