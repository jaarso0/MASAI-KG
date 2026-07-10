import { Symbol, Scope, ScopeKind, Range } from '../semantic-model/types.js';
import { createScope } from '../semantic-model/builder.js';

export class ContextTracker {
  private scopeStack: Scope[] = [];
  private symbolStack: Symbol[] = [];
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  public enterScope(kind: ScopeKind, range: Range, ownerSymbol?: Symbol): Scope {
    const parentScopeId = this.currentScope ? this.currentScope.id : null;
    const ownerSymbolId = ownerSymbol ? ownerSymbol.id : (this.currentParentSymbol ? this.currentParentSymbol.id : null);
    
    const scope = createScope({
      filePath: this.filePath,
      kind,
      range,
      parentScopeId,
      ownerSymbolId
    });

    this.scopeStack.push(scope);
    return scope;
  }

  public exitScope(): void {
    this.scopeStack.pop();
  }

  public enterSymbol(symbol: Symbol): void {
    this.symbolStack.push(symbol);
  }

  public exitSymbol(): void {
    this.symbolStack.pop();
  }

  public get currentScope(): Scope | undefined {
    return this.scopeStack[this.scopeStack.length - 1];
  }

  public get currentParentSymbol(): Symbol | undefined {
    return this.symbolStack[this.symbolStack.length - 1];
  }

  public buildIdChain(name: string): string[] {
    const chain = this.symbolStack.map(s => s.name);
    if (name) {
      chain.push(name);
    }
    return chain;
  }

  public getallScopes(): Scope[] {
    return [...this.scopeStack];
  }

  public getallSymbols(): Symbol[] {
    return [...this.symbolStack];
  }
}
