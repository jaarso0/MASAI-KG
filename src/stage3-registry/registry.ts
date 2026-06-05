import { Symbol, Scope, Range } from '../semantic-model/types.js';
import { MergeableModel } from '../semantic-model/merge.js';

// ════════════════════════════════════════════
// RANGE CONTAINMENT HELPER
// ════════════════════════════════════════════

export function isRangeContained(inner: Range, outer: Range): boolean {
  if (inner.start.line < outer.start.line) return false;
  if (inner.start.line === outer.start.line && inner.start.column < outer.start.column) return false;
  if (inner.end.line > outer.end.line) return false;
  if (inner.end.line === outer.end.line && inner.end.column > outer.end.column) return false;
  return true;
}

export function getModulePaths(filePath: string): string[] {
  const norm = filePath.replace(/\\/g, '/');
  const extIndex = norm.lastIndexOf('.');
  const base = extIndex !== -1 ? norm.slice(0, extIndex) : norm;
  const dotPath = base.replace(/\//g, '.');
  const paths = new Set<string>([base, dotPath]);

  if (norm.endsWith('/__init__.py')) {
    const pkg = norm.slice(0, -12); // remove "/__init__.py"
    paths.add(pkg);
    paths.add(pkg.replace(/\//g, '.'));
  } else {
    const indexSuffixes = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
    for (const suffix of indexSuffixes) {
      if (norm.endsWith(suffix)) {
        const pkg = norm.slice(0, -suffix.length);
        paths.add(pkg);
        paths.add(pkg.replace(/\//g, '.'));
        break;
      }
    }
  }

  return Array.from(paths);
}

// ════════════════════════════════════════════
// INDEX IMPLEMENTATIONS
// ════════════════════════════════════════════

export class SymbolIndex {
  private index = new Map<string, Symbol>();

  public add(symbol: Symbol): void {
    this.index.set(symbol.id, symbol);
  }

  public lookup(id: string): Symbol | undefined {
    return this.index.get(id);
  }

  public remove(id: string): void {
    this.index.delete(id);
  }

  public clear(): void {
    this.index.clear();
  }

  public values(): Symbol[] {
    return Array.from(this.index.values());
  }
}

export class NameIndex {
  private index = new Map<string, Symbol[]>();

  public add(symbol: Symbol): void {
    const list = this.index.get(symbol.name) || [];
    list.push(symbol);
    this.index.set(symbol.name, list);
  }

  public lookup(name: string): Symbol[] {
    return this.index.get(name) || [];
  }

  public removeFile(filePath: string): void {
    const normalized = filePath.replace(/\\/g, '/');
    for (const [name, symbols] of this.index.entries()) {
      const filtered = symbols.filter(s => s.filePath !== normalized);
      if (filtered.length === 0) {
        this.index.delete(name);
      } else {
        this.index.set(name, filtered);
      }
    }
  }

  public clear(): void {
    this.index.clear();
  }
}

export class QualifiedNameIndex {
  private index = new Map<string, Symbol[]>();

  public add(symbol: Symbol): void {
    const list = this.index.get(symbol.qualifiedName) || [];
    list.push(symbol);
    this.index.set(symbol.qualifiedName, list);
  }

  public lookup(qname: string): Symbol[] {
    return this.index.get(qname) || [];
  }

  public removeFile(filePath: string): void {
    const normalized = filePath.replace(/\\/g, '/');
    for (const [qname, symbols] of this.index.entries()) {
      const filtered = symbols.filter(s => s.filePath !== normalized);
      if (filtered.length === 0) {
        this.index.delete(qname);
      } else {
        this.index.set(qname, filtered);
      }
    }
  }

  public clear(): void {
    this.index.clear();
  }
}

export class FileIndex {
  private index = new Map<string, Symbol[]>();

  public add(symbol: Symbol): void {
    const list = this.index.get(symbol.filePath) || [];
    list.push(symbol);
    this.index.set(symbol.filePath, list);
  }

  public lookup(filePath: string): Symbol[] {
    const normalized = filePath.replace(/\\/g, '/');
    return this.index.get(normalized) || [];
  }

  public removeFile(filePath: string): void {
    const normalized = filePath.replace(/\\/g, '/');
    this.index.delete(normalized);
  }

  public clear(): void {
    this.index.clear();
  }
}

export class ModuleIndex {
  // module path -> Symbol (which represents the 'file' kind symbol of that module)
  private index = new Map<string, Symbol>();

  public add(filePath: string, fileSymbol: Symbol): void {
    const paths = getModulePaths(filePath);
    for (const p of paths) {
      this.index.set(p, fileSymbol);
    }
  }

  public lookup(modulePath: string): Symbol | undefined {
    return this.index.get(modulePath);
  }

  public removeFile(filePath: string): void {
    const paths = getModulePaths(filePath);
    for (const p of paths) {
      this.index.delete(p);
    }
  }

  public clear(): void {
    this.index.clear();
  }
}

export class ScopeIndex {
  // Maps Scope.id -> Symbols declared inside its innermost boundary
  private byScopeId = new Map<string, Symbol[]>();
  // Maps Symbol.id -> containing Scope
  private bySymbolId = new Map<string, Scope>();
  private scopes = new Map<string, Scope>();

  public build(symbols: Symbol[], scopes: Scope[]): void {
    this.clear();
    for (const scope of scopes) {
      this.scopes.set(scope.id, scope);
    }

    for (const symbol of symbols) {
      if (symbol.kind === 'project' || symbol.kind === 'file') continue;

      const innermost = this.getInnermostScope(scopes, symbol);
      if (innermost) {
        this.bySymbolId.set(symbol.id, innermost);
        const list = this.byScopeId.get(innermost.id) || [];
        list.push(symbol);
        this.byScopeId.set(innermost.id, list);
      }
    }
  }

  private getInnermostScope(scopes: Scope[], symbol: Symbol): Scope | undefined {
    const containing = scopes.filter(
      s => s.filePath === symbol.filePath &&
           s.ownerSymbolId !== symbol.id &&
           isRangeContained(symbol.range, s.range)
    );
    if (containing.length === 0) return undefined;

    // Sort by range size (smaller first)
    containing.sort((a, b) => {
      const sizeA = (a.range.end.line - a.range.start.line) * 10000 + (a.range.end.column - a.range.start.column);
      const sizeB = (b.range.end.line - b.range.start.line) * 10000 + (b.range.end.column - b.range.start.column);
      return sizeA - sizeB;
    });

    return containing[0];
  }

  public getSymbolsInScope(scopeId: string): Symbol[] {
    return this.byScopeId.get(scopeId) || [];
  }

  public getScopeForSymbol(symbolId: string): Scope | undefined {
    return this.bySymbolId.get(symbolId);
  }

  public getScopeById(scopeId: string): Scope | undefined {
    return this.scopes.get(scopeId);
  }

  public clear(): void {
    this.byScopeId.clear();
    this.bySymbolId.clear();
    this.scopes.clear();
  }
}

// ════════════════════════════════════════════
// REGISTRY FACADE
// ════════════════════════════════════════════

export class SymbolRegistry {
  public readonly byId = new SymbolIndex();
  public readonly byName = new NameIndex();
  public readonly byQualifiedName = new QualifiedNameIndex();
  public readonly byFile = new FileIndex();
  public readonly byModule = new ModuleIndex();
  public readonly byScope = new ScopeIndex();

  private rawScopes: Scope[] = [];

  public build(mergedModel: MergeableModel): void {
    this.clear();
    this.rawScopes = [...mergedModel.scopes];

    // Populate standard indexes
    for (const sym of mergedModel.symbols) {
      this.byId.add(sym);
      this.byName.add(sym);
      this.byQualifiedName.add(sym);
      this.byFile.add(sym);

      if (sym.kind === 'file') {
        this.byModule.add(sym.filePath, sym);
      }
    }

    // Build Scope Index
    this.byScope.build(mergedModel.symbols, mergedModel.scopes);
  }

  public rebuildFile(filePath: string, symbols: Symbol[], newScopes: Scope[]): void {
    const normalized = filePath.replace(/\\/g, '/');

    // Remove old symbols from all indexes
    const oldSymbols = this.byFile.lookup(normalized);
    for (const sym of oldSymbols) {
      this.byId.remove(sym.id);
    }
    this.byName.removeFile(normalized);
    this.byQualifiedName.removeFile(normalized);
    this.byFile.removeFile(normalized);
    this.byModule.removeFile(normalized);

    // Remove old scopes for this file
    this.rawScopes = this.rawScopes.filter(s => s.filePath !== normalized);

    // Add new symbols
    for (const sym of symbols) {
      this.byId.add(sym);
      this.byName.add(sym);
      this.byQualifiedName.add(sym);
      this.byFile.add(sym);

      if (sym.kind === 'file') {
        this.byModule.add(sym.filePath, sym);
      }
    }

    // Add new scopes
    this.rawScopes.push(...newScopes);

    // Rebuild scope index
    const allSymbols = this.byId.values();
    this.byScope.build(allSymbols, this.rawScopes);
  }

  public clear(): void {
    this.byId.clear();
    this.byName.clear();
    this.byQualifiedName.clear();
    this.byFile.clear();
    this.byModule.clear();
    this.byScope.clear();
    this.rawScopes = [];
  }
}
