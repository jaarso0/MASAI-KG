import { describe, test, expect } from 'vitest';
import { createSymbol, createScope } from '../src/semantic-model/builder.js';
import { SymbolRegistry } from '../src/registry/registry.js';
import { MergeableModel } from '../src/semantic-model/merge.js';

describe('Stage 3 - Registry', () => {
  test('Registry handles collisions in byName and byQualifiedName indices', () => {
    const sym1 = createSymbol({
      filePath: 'services/user.py',
      chain: ['UserService', 'save'],
      kind: 'method',
      range: { start: { line: 5, column: 4 }, end: { line: 8, column: 4 } }
    });

    const sym2 = createSymbol({
      filePath: 'admin/user.py',
      chain: ['UserService', 'save'],
      kind: 'method',
      range: { start: { line: 5, column: 4 }, end: { line: 8, column: 4 } }
    });

    const registry = new SymbolRegistry();
    const model: MergeableModel = {
      symbols: [sym1, sym2],
      scopes: [],
      containments: [],
      references: [],
      diagnostics: []
    };

    registry.build(model);

    // Collisions in byName -> 'save' returns both
    const nameMatches = registry.byName.lookup('save');
    expect(nameMatches.length).toBe(2);
    expect(nameMatches.map(s => s.id)).toContain('services/user.py::UserService::save');
    expect(nameMatches.map(s => s.id)).toContain('admin/user.py::UserService::save');

    // Collisions in byQualifiedName -> 'UserService.save' returns both
    const qnameMatches = registry.byQualifiedName.lookup('UserService.save');
    expect(qnameMatches.length).toBe(2);
    expect(qnameMatches.map(s => s.id)).toContain('services/user.py::UserService::save');
    expect(qnameMatches.map(s => s.id)).toContain('admin/user.py::UserService::save');
  });

  test('byFile and byModule indexes work correctly', () => {
    const fileSymbol = createSymbol({
      filePath: 'services/user.py',
      chain: ['services/user.py'],
      kind: 'file',
      range: { start: { line: 0, column: 0 }, end: { line: 20, column: 0 } }
    });

    const methodSym = createSymbol({
      filePath: 'services/user.py',
      chain: ['UserService', 'save'],
      kind: 'method',
      range: { start: { line: 5, column: 4 }, end: { line: 8, column: 4 } }
    });

    const registry = new SymbolRegistry();
    const model: MergeableModel = {
      symbols: [fileSymbol, methodSym],
      scopes: [],
      containments: [],
      references: [],
      diagnostics: []
    };

    registry.build(model);

    // File lookup
    const fileSymbols = registry.byFile.lookup('services/user.py');
    expect(fileSymbols.length).toBe(2);
    expect(fileSymbols).toContain(fileSymbol);
    expect(fileSymbols).toContain(methodSym);

    // Module lookup (e.g. services.user for Python)
    const moduleMatch = registry.byModule.lookup('services.user');
    expect(moduleMatch).toBeDefined();
    expect(moduleMatch?.id).toBe(fileSymbol.id);
  });

  test('byScope index correctly identifies innermost scopes', () => {
    const filePath = 'index.ts';

    const fileSymbol = createSymbol({
      filePath,
      chain: [filePath],
      kind: 'file',
      range: { start: { line: 0, column: 0 }, end: { line: 100, column: 0 } }
    });

    const globalScope = createScope({
      filePath,
      kind: 'global',
      range: fileSymbol.range,
      parentScopeId: null,
      ownerSymbolId: fileSymbol.id
    });

    const funcSym = createSymbol({
      filePath,
      chain: ['myFunc'],
      kind: 'function',
      range: { start: { line: 10, column: 0 }, end: { line: 30, column: 0 } }
    });

    const funcScope = createScope({
      filePath,
      kind: 'function',
      range: funcSym.range,
      parentScopeId: globalScope.id,
      ownerSymbolId: funcSym.id
    });

    const varInsideFunc = createSymbol({
      filePath,
      chain: ['myFunc', 'localVar'],
      kind: 'variable',
      range: { start: { line: 15, column: 4 }, end: { line: 15, column: 15 } }
    });

    const varOutsideFunc = createSymbol({
      filePath,
      chain: ['globalVar'],
      kind: 'variable',
      range: { start: { line: 5, column: 0 }, end: { line: 5, column: 15 } }
    });

    const registry = new SymbolRegistry();
    const model: MergeableModel = {
      symbols: [fileSymbol, funcSym, varInsideFunc, varOutsideFunc],
      scopes: [globalScope, funcScope],
      containments: [],
      references: [],
      diagnostics: []
    };

    registry.build(model);

    // varInsideFunc should be assigned to the innermost funcScope
    const containingScope = registry.byScope.getScopeForSymbol(varInsideFunc.id);
    expect(containingScope).toBeDefined();
    expect(containingScope?.id).toBe(funcScope.id);

    // varOutsideFunc should be assigned to the globalScope
    const containingGlobal = registry.byScope.getScopeForSymbol(varOutsideFunc.id);
    expect(containingGlobal).toBeDefined();
    expect(containingGlobal?.id).toBe(globalScope.id);

    // symbols inside funcScope should be varInsideFunc only (funcSym is the owner/outer boundary itself, or could be in global scope)
    const symbolsInScope = registry.byScope.getSymbolsInScope(funcScope.id);
    expect(symbolsInScope.length).toBe(1);
    expect(symbolsInScope[0].id).toBe(varInsideFunc.id);
  });
});
