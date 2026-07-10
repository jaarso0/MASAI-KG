import Parser from 'tree-sitter';
import * as path from 'path';
import { Capture } from './facts.js';
import {
  Symbol,
  Scope,
  Containment,
  ReferenceCandidate,
  Diagnostic,
  Range,
  SymbolKind,
  ReferenceKind,
  ScopeKind,
  LocalTypeBinding
} from '../semantic-model/types.js';
import { ContextTracker } from './context-tracker.js';
import {
  createSymbol,
  createScope,
  createContainment,
  createReferenceCandidate,
  createDiagnostic
} from '../semantic-model/builder.js';
import { runAdapters } from '../frameworks/adapter-registry.js';

// ════════════════════════════════════════════
// RANGE CONTAINMENT HELPERS
// ════════════════════════════════════════════

function getRange(node: Parser.SyntaxNode): Range {
  return {
    start: { line: node.startPosition.row, column: node.startPosition.column },
    end: { line: node.endPosition.row, column: node.endPosition.column }
  };
}

function isRangeContained(inner: Range, outer: Range): boolean {
  if (inner.start.line < outer.start.line) return false;
  if (inner.start.line === outer.start.line && inner.start.column < outer.start.column) return false;
  if (inner.end.line > outer.end.line) return false;
  if (inner.end.line === outer.end.line && inner.end.column > outer.end.column) return false;
  return true;
}

// ════════════════════════════════════════════
// QUALIFIER CHAIN HELPERS
// ════════════════════════════════════════════

function getQualifierChain(node: any): string[] {
  if (!node) return [];
  const type = node.type;
  if (
    type === 'identifier' ||
    type === 'property_identifier' ||
    type === 'shorthand_property_identifier' ||
    type === 'type_identifier'
  ) {
    return [node.text];
  }
  if (type === 'member_expression') {
    const obj = node.childForFieldName('object');
    const prop = node.childForFieldName('property');
    if (obj && prop) {
      return [...getQualifierChain(obj), ...getQualifierChain(prop)];
    }
  }
  if (type === 'attribute') {
    const val = node.childForFieldName('object') || node.childForFieldName('value');
    const attr = node.childForFieldName('attribute');
    if (val && attr) {
      return [...getQualifierChain(val), ...getQualifierChain(attr)];
    }
  }
  if (type === 'scoped_identifier') {
    const scope = node.childForFieldName('scope');
    const name = node.childForFieldName('name');
    if (scope && name) {
      return [...getQualifierChain(scope), ...getQualifierChain(name)];
    }
  }
  if (type === 'scoped_type_identifier') {
    const path = node.childForFieldName('path');
    const name = node.childForFieldName('name');
    if (path && name) {
      return [...getQualifierChain(path), ...getQualifierChain(name)];
    }
  }
  return [node.text];
}

function getJavaCallQualifierChain(node: any): string[] {
  const chain: string[] = [];
  const traverse = (n: any) => {
    if (!n) return;
    if (n.type === 'identifier' || n.type === 'property_identifier' || n.type === 'type_identifier') {
      chain.push(n.text);
    } else if (n.type === 'field_access') {
      const obj = n.childForFieldName('object');
      const field = n.childForFieldName('field');
      traverse(obj);
      traverse(field);
    } else if (n.type === 'method_invocation') {
      const obj = n.childForFieldName('object');
      const name = n.childForFieldName('name');
      traverse(obj);
      traverse(name);
    } else {
      chain.push(n.text);
    }
  };

  const obj = node.childForFieldName('object');
  const name = node.childForFieldName('name');
  traverse(obj);
  traverse(name);
  return chain;
}

// ════════════════════════════════════════════
// IMPORT PATH RESOLVERS
// ════════════════════════════════════════════

function getTSImportPath(node: any): string | undefined {
  let cur = node;
  while (cur && cur.type !== 'import_statement') {
    cur = cur.parent;
  }
  if (cur) {
    const sourceNode = cur.childForFieldName('source');
    if (sourceNode && sourceNode.type === 'string') {
      return sourceNode.text.replace(/^['"]|['"]$/g, '');
    }
  }
  return undefined;
}

function getPythonImportPath(node: any, nameNode: any): string | undefined {
  let parent = nameNode;
  while (parent && parent.type !== 'import_from_statement' && parent.type !== 'import_statement') {
    parent = parent.parent;
  }

  if (parent) {
    if (parent.type === 'import_from_statement') {
      const moduleNode = parent.childForFieldName('module_name');
      if (moduleNode) {
        return moduleNode.text.replace(/\./g, '/');
      }
    } else if (parent.type === 'import_statement') {
      // For import_statement, if the nameNode is inside an aliased_import, we want the real name
      let cur = nameNode;
      while (cur && cur !== parent) {
        if (cur.type === 'aliased_import') {
          const realNameNode = cur.childForFieldName('name');
          if (realNameNode) {
            return getQualifierChain(realNameNode).join('/');
          }
        }
        cur = cur.parent;
      }
    }
  }

  return getQualifierChain(nameNode).join('/');
}

function getImportedName(nameNode: any): string {
  if (nameNode.parent) {
    if (nameNode.parent.type === 'aliased_import' || nameNode.parent.type === 'import_specifier') {
      const realNameNode = nameNode.parent.childForFieldName('name');
      if (realNameNode) {
        return realNameNode.text;
      }
    }
  }
  return nameNode.text;
}

// ════════════════════════════════════════════
// DECLARED-TYPE INFERENCE (for instance member resolution)
// ════════════════════════════════════════════
//
// Best-effort: figures out what class/type a variable holds, so Stage 4
// can resolve `instance.method()` calls through to the class's members.
// Only handles the common, unambiguous cases (explicit `new X()`, TS type
// annotations, and `x = ClassName()` in Python where the callee looks
// like a class name) — anything murkier is left unresolved rather than guessed.
function getDeclaredTypeChain(node: any, filePath: string): string[] | undefined {
  if (filePath.endsWith('.py')) {
    if (node.type !== 'assignment') return undefined;
    const right = node.childForFieldName('right');
    if (!right || right.type !== 'call') return undefined;
    const func = right.childForFieldName('function');
    if (!func) return undefined;
    const chain = getQualifierChain(func);
    const last = chain[chain.length - 1];
    if (!last || last[0] !== last[0].toUpperCase() || last[0] === last[0].toLowerCase()) return undefined;
    return chain;
  }

  if (node.type !== 'variable_declarator') return undefined;

  const typeAnnotation = node.childForFieldName('type');
  if (typeAnnotation) {
    const typeNode = typeAnnotation.children?.find(
      (c: any) => c.type === 'type_identifier' || c.type === 'nested_type_identifier' || c.type === 'generic_type'
    );
    if (typeNode) {
      return getQualifierChain(typeNode.type === 'generic_type' ? typeNode.childForFieldName('name') ?? typeNode : typeNode);
    }
  }

  const value = node.childForFieldName('value');
  if (value && value.type === 'new_expression') {
    const ctor = value.childForFieldName('constructor');
    if (ctor) return getQualifierChain(ctor);
  }

  return undefined;
}

// ════════════════════════════════════════════
// VISIBILITY & EXPORT DETERMINERS
// ════════════════════════════════════════════

function getSymbolMetadata(
  node: Parser.SyntaxNode,
  name: string,
  filePath: string
): { exported: boolean; visibility: 'public' | 'private' | 'protected' | 'internal' } {
  if (filePath.endsWith('.py')) {
    const isPrivate = name.startsWith('_') && !name.startsWith('__');
    return {
      exported: !isPrivate,
      visibility: isPrivate ? 'private' : 'public'
    };
  }

  if (filePath.endsWith('.java')) {
    let cur: any = node;
    let modifiers = cur.childForFieldName('modifiers') ?? cur.children.find((c: any) => c.type === 'modifiers');
    if (!modifiers && cur.parent) {
      modifiers = cur.parent.childForFieldName('modifiers') ?? cur.parent.children.find((c: any) => c.type === 'modifiers');
    }
    if (modifiers) {
      const text = modifiers.text;
      if (text.includes('private')) {
        return { visibility: 'private', exported: false };
      }
      if (text.includes('protected')) {
        return { visibility: 'protected', exported: false };
      }
    }
    return { visibility: 'public', exported: true };
  }

  if (filePath.endsWith('.html')) {
    return {
      exported: true,
      visibility: 'public'
    };
  }

  const isPrivate = name.startsWith('#');
  let isExported = false;
  let cur: any = node;
  while (cur) {
    if (cur.type === 'export_statement') {
      isExported = true;
      break;
    }
    cur = cur.parent;
  }
  return {
    exported: isExported,
    visibility: isPrivate ? 'private' : 'public'
  };
}

// ════════════════════════════════════════════
// CONTEXT SYNCHRONIZER
// ════════════════════════════════════════════

function syncContext(node: Parser.SyntaxNode, tracker: ContextTracker) {
  const nodeRange = getRange(node);

  while (tracker.currentParentSymbol) {
    const parentSym = tracker.currentParentSymbol;
    if (parentSym.kind === 'file' || parentSym.kind === 'project') {
      break;
    }
    if (isRangeContained(nodeRange, parentSym.range)) {
      break;
    }
    tracker.exitSymbol();
  }

  while (tracker.currentScope) {
    const curScope = tracker.currentScope;
    if (curScope.kind === 'global') {
      break;
    }
    if (isRangeContained(nodeRange, curScope.range)) {
      break;
    }
    tracker.exitScope();
  }
}

// ════════════════════════════════════════════
// CAPTURE NORMALIZER MAIN ENTRY
// ════════════════════════════════════════════

export interface NormalizerOutput {
  symbols: Symbol[];
  scopes: Scope[];
  containments: Containment[];
  references: ReferenceCandidate[];
  diagnostics: Diagnostic[];
  localTypeBindings: LocalTypeBinding[];
}

export function normalizeCaptures(
  captures: Capture[],
  filePath: string,
  rootNode: Parser.SyntaxNode
): NormalizerOutput {
  const tracker = new ContextTracker(filePath);

  const symbols: Symbol[] = [];
  const scopes: Scope[] = [];
  const containments: Containment[] = [];
  const references: ReferenceCandidate[] = [];
  const diagnostics: Diagnostic[] = [];
  const localTypeBindings: LocalTypeBinding[] = [];

  // Create file-level symbol and global scope
  const fileRange = getRange(rootNode);
  const fileSymbol = createSymbol({
    filePath,
    chain: [filePath],
    kind: 'file',
    range: fileRange,
    exported: true,
    visibility: 'public'
  });
  symbols.push(fileSymbol);

  const globalScope = tracker.enterScope('global', fileRange, fileSymbol);
  scopes.push(globalScope);

  // Sort captures by start position, then by range size (larger first) for structural nesting
  const sorted = [...captures].sort((a, b) => {
    const startA = a.node.startPosition;
    const startB = b.node.startPosition;
    if (startA.row !== startB.row) {
      return startA.row - startB.row;
    }
    if (startA.column !== startB.column) {
      return startA.column - startB.column;
    }
    const endA = a.node.endPosition;
    const endB = b.node.endPosition;
    if (endA.row !== endB.row) {
      return endB.row - endA.row;
    }
    return endB.column - endA.column;
  });

  for (const capture of sorted) {
    const { tag, name, node, nameNode } = capture;

    // Synchronize active scope/symbol contexts to our current node
    syncContext(node, tracker);

    // Identify tag class/family
    if (tag.startsWith('definition.')) {
      const kindStr = tag.substring('definition.'.length);
      const kind: SymbolKind = kindStr as SymbolKind;

      // Handle variable scope containment rule: local block/method variables don't become
      // full Symbols (they'd pollute name search), but we still record their declared type
      // as a resolver-only LocalTypeBinding so `localVar.method()` calls can be resolved.
      if (kind === 'variable') {
        const parentKind = tracker.currentParentSymbol?.kind;
        const isTopOrClassLevel =
          parentKind === undefined || parentKind === 'file' || parentKind === 'class' || parentKind === 'interface';
        if (!isTopOrClassLevel) {
          const owner = tracker.currentParentSymbol;
          const declaredTypeChain = getDeclaredTypeChain(node, filePath);
          if (owner && declaredTypeChain && declaredTypeChain.length > 0) {
            localTypeBindings.push({
              ownerSymbolId: owner.id,
              name,
              filePath,
              range: getRange(node),
              declaredType: {
                qualifierChain: declaredTypeChain,
                rawName: declaredTypeChain.join('.')
              }
            });
          }
          continue;
        }
      }

      const { exported, visibility } = getSymbolMetadata(node, name, filePath);
      const chain = tracker.buildIdChain(name);

      const adapterMeta = runAdapters(node, rootNode, filePath);
      const symbolMetadata: Record<string, unknown> = {};
      if (adapterMeta.apiRoute) symbolMetadata.apiRoute = adapterMeta.apiRoute;
      if (adapterMeta.dataModel) symbolMetadata.dataModel = adapterMeta.dataModel;
      if (adapterMeta.isService) symbolMetadata.isService = adapterMeta.isService;

      if (kind === 'variable') {
        const declaredTypeChain = getDeclaredTypeChain(node, filePath);
        if (declaredTypeChain && declaredTypeChain.length > 0) {
          symbolMetadata.declaredType = {
            qualifierChain: declaredTypeChain,
            rawName: declaredTypeChain.join('.')
          };
        }
      }

      const sym = createSymbol({
        filePath,
        chain,
        kind,
        range: getRange(node),
        exported,
        visibility,
        metadata: symbolMetadata
      });
      symbols.push(sym);

      // Establish structural containment edge
      const parent = tracker.currentParentSymbol;
      if (parent) {
        containments.push(
          createContainment(
            parent.id,
            sym.id,
            kind === 'method' ? 'has_member' : 'owns'
          )
        );
      }

      // If symbol defines a scope boundary, enter it
      const createsScope =
        kind === 'class' || kind === 'interface' || kind === 'function' || kind === 'method';
      if (createsScope) {
        const scopeKind: ScopeKind = (kind === 'class' || kind === 'interface') ? 'class' : 'function';
        const newScope = tracker.enterScope(scopeKind, getRange(node), sym);
        scopes.push(newScope);
        tracker.enterSymbol(sym);
      }
    } else if (tag === 'call' || tag === 'new' || tag === 'import' || tag === 'inherit' || tag === 'implement' || tag === 'type_use') {
      const fromSym = tracker.currentParentSymbol ?? fileSymbol;
      const refKindMap: Record<string, ReferenceKind> = {
        call: 'call',
        new: 'instantiate',
        import: 'import',
        inherit: 'inherit',
        implement: 'implement',
        type_use: 'type_use'
      };

      const refKind = refKindMap[tag];
      let importPath: string | undefined;

      let metadata: Record<string, unknown> = {};
      if (refKind === 'import') {
        if (filePath.endsWith('.py')) {
          importPath = getPythonImportPath(node, nameNode);
        } else if (filePath.endsWith('.java')) {
          importPath = nameNode.text.replace(/\./g, '/');
        } else if (filePath.endsWith('.html')) {
          importPath = nameNode.text.replace(/^['"]|['"]$/g, '');
        } else {
          importPath = getTSImportPath(node);
        }
        metadata.importedName = getImportedName(nameNode);
      }

      let qualifierChain = getQualifierChain(nameNode);
      let rawName = nameNode.text;

      if (filePath.endsWith('.java') && node.type === 'method_invocation') {
        qualifierChain = getJavaCallQualifierChain(node);
        rawName = qualifierChain.join('.');
      }

      references.push(
        createReferenceCandidate({
          fromSymbolId: fromSym.id,
          kind: refKind,
          rawName,
          qualifierChain,
          importPath,
          astNodeType: node.type,
          filePath,
          range: getRange(nameNode),
          metadata
        })
      );
    } else if (tag === 'error') {
      diagnostics.push(
        createDiagnostic({
          kind: 'parse_error',
          severity: 'error',
          message: `Syntax error at line ${node.startPosition.row + 1}`,
          filePath,
          range: getRange(node)
        })
      );
    }
  }

  // Finalize global scope pop and cleanup remaining stacks
  while (tracker.currentParentSymbol) {
    tracker.exitSymbol();
  }
  while (tracker.currentScope) {
    tracker.exitScope();
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
