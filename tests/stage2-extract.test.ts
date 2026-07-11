import { describe, test, expect } from 'vitest';
import * as path from 'path';
import { parseProject } from '../src/parse/walker.js';
import { extractorRegistry } from '../src/extract/extractor-registry.js';
import { parserRegistry } from '../src/parse/parser-registry.js';

describe('Stage 2 - Extract', () => {
  test('Extracts TS/JS symbols, scopes, containments, and candidates', async () => {
    const tsProjPath = path.resolve('tests/fixtures/typescript-project');
    const parsedFiles = await parseProject(tsProjPath);

    const serviceFile = parsedFiles.find(f => f.filePath === 'src/services/user.ts');
    expect(serviceFile).toBeDefined();

    const extractor = extractorRegistry.getExtractor(serviceFile!.language);
    const partialModel = extractor.extract(serviceFile!);

    expect(partialModel.filePath).toBe('src/services/user.ts');

    // Symbols extracted: file, UserService class, save method, getById method, users variable
    expect(partialModel.symbols.length).toBeGreaterThanOrEqual(4);

    const classSym = partialModel.symbols.find(s => s.kind === 'class');
    expect(classSym).toBeDefined();
    expect(classSym?.id).toBe('src/services/user.ts::UserService');
    expect(classSym?.name).toBe('UserService');
    expect(classSym?.qualifiedName).toBe('UserService');

    const methodSym = partialModel.symbols.find(s => s.kind === 'method' && s.name === 'save');
    expect(methodSym).toBeDefined();
    expect(methodSym?.id).toBe('src/services/user.ts::UserService::save');
    expect(methodSym?.qualifiedName).toBe('UserService.save');

    // Scopes extracted: global scope, class scope, method scope, etc.
    expect(partialModel.scopes.length).toBeGreaterThanOrEqual(3);
    const classScope = partialModel.scopes.find(s => s.kind === 'class');
    expect(classScope).toBeDefined();
    expect(classScope?.ownerSymbolId).toBe(classSym?.id);

    // Containments extracted: UserService owns save, UserService owns getById, UserService owns users
    expect(partialModel.containments.length).toBeGreaterThanOrEqual(2);
    const classOwnsMethod = partialModel.containments.find(
      c => c.parentId === classSym?.id && c.childId === methodSym?.id
    );
    expect(classOwnsMethod).toBeDefined();
    expect(classOwnsMethod?.kind).toBe('has_member');

    // Reference candidates: import of User model, and call of console.log
    expect(partialModel.references.length).toBeGreaterThanOrEqual(2);
    const importCand = partialModel.references.find(r => r.kind === 'import');
    expect(importCand).toBeDefined();
    expect(importCand?.importPath).toBe('../models/user.js');
    expect(importCand?.rawName).toBe('User');
  });

  test('Extracts Python symbols, scopes, containments, and candidates', async () => {
    const pythonProjPath = path.resolve('tests/fixtures/python-project');
    const parsedFiles = await parseProject(pythonProjPath);

    const mainFile = parsedFiles.find(f => f.filePath === 'main.py');
    expect(mainFile).toBeDefined();

    const extractor = extractorRegistry.getExtractor(mainFile!.language);
    const partialModel = extractor.extract(mainFile!);

    // References extracted from main.py
    // imports: `from services.user import UserService, get_current_user`
    // calls: `get_current_user()`, `UserService()`, `service.save(...)`, etc.
    expect(partialModel.references.length).toBeGreaterThanOrEqual(4);
    const importRefs = partialModel.references.filter(r => r.kind === 'import');
    expect(importRefs.length).toBeGreaterThanOrEqual(3);
    expect(importRefs.some(r => r.rawName === 'UserService' && r.importPath === 'services/user')).toBe(true);

    const callRefs = partialModel.references.filter(r => r.kind === 'call');
    expect(callRefs.length).toBeGreaterThanOrEqual(2);
    expect(callRefs.some(r => r.rawName === 'get_current_user')).toBe(true);
    expect(callRefs.some(r => r.rawName === 'UserService')).toBe(true);
  });

  test('Extracts Java symbols, scopes, containments, and candidates', () => {
    const javaCode = `
      package com.example;
      import com.example.db.Repository;
      
      public class UserService extends BaseService implements Service {
          private Repository repo;
          
          public void save() {
              repo.save();
          }
      }
    `;
    const parser = parserRegistry.getParser('java');
    const tree = parser.parse(javaCode);
    const parsedFile = {
      filePath: 'src/main/java/com/example/UserService.java',
      absolutePath: '/absolute/src/main/java/com/example/UserService.java',
      language: 'java' as const,
      tree,
      sourceCode: javaCode
    };

    const extractor = extractorRegistry.getExtractor('java');
    const partialModel = extractor.extract(parsedFile);

    expect(partialModel.filePath).toBe('src/main/java/com/example/UserService.java');

    // Symbols: File, UserService class, save method, repo variable
    expect(partialModel.symbols.length).toBe(4);

    const classSym = partialModel.symbols.find(s => s.kind === 'class');
    expect(classSym).toBeDefined();
    expect(classSym?.name).toBe('UserService');
    expect(classSym?.id).toBe('src/main/java/com/example/UserService.java::UserService');

    const methodSym = partialModel.symbols.find(s => s.kind === 'method');
    expect(methodSym).toBeDefined();
    expect(methodSym?.name).toBe('save');
    expect(methodSym?.id).toBe('src/main/java/com/example/UserService.java::UserService::save');

    const varSym = partialModel.symbols.find(s => s.kind === 'variable');
    expect(varSym).toBeDefined();
    expect(varSym?.name).toBe('repo');

    // Containments
    const classOwnsVar = partialModel.containments.find(
      c => c.parentId === classSym?.id && c.childId === varSym?.id
    );
    expect(classOwnsVar).toBeDefined();
    expect(classOwnsVar?.kind).toBe('owns');

    const classOwnsMethod = partialModel.containments.find(
      c => c.parentId === classSym?.id && c.childId === methodSym?.id
    );
    expect(classOwnsMethod).toBeDefined();
    expect(classOwnsMethod?.kind).toBe('has_member');

    // References: Import, inherit, implement, call
    expect(partialModel.references.length).toBe(4);

    const importRef = partialModel.references.find(r => r.kind === 'import');
    expect(importRef).toBeDefined();
    expect(importRef?.rawName).toBe('com.example.db.Repository');
    expect(importRef?.importPath).toBe('com/example/db/Repository');

    const inheritRef = partialModel.references.find(r => r.kind === 'inherit');
    expect(inheritRef).toBeDefined();
    expect(inheritRef?.rawName).toBe('BaseService');

    const implementRef = partialModel.references.find(r => r.kind === 'implement');
    expect(implementRef).toBeDefined();
    expect(implementRef?.rawName).toBe('Service');

    const callRef = partialModel.references.find(r => r.kind === 'call');
    expect(callRef).toBeDefined();
    expect(callRef?.rawName).toBe('repo.save');
  });

  test('Extracts FastAPI, SQLAlchemy, and Service metadata via framework adapters', () => {
    const pythonCode = `
from fastapi import FastAPI
from sqlalchemy.ext.declarative import declarative_base

app = FastAPI()
Base = declarative_base()

class User(Base):
    __tablename__ = "users"

@app.post("/users")
def create_user():
    pass

class UserService:
    pass
    `;
    const parser = parserRegistry.getParser('python');
    const tree = parser.parse(pythonCode);
    const parsedFile = {
      filePath: 'app/main.py',
      absolutePath: '/absolute/app/main.py',
      language: 'python' as const,
      tree,
      sourceCode: pythonCode
    };

    const extractor = extractorRegistry.getExtractor('python');
    const partialModel = extractor.extract(parsedFile);

    // Verify symbols
    const userClass = partialModel.symbols.find(s => s.kind === 'class' && s.name === 'User');
    expect(userClass).toBeDefined();
    expect(userClass?.metadata?.dataModel).toEqual({ tableName: 'users' });

    const createUserFunc = partialModel.symbols.find(s => s.kind === 'function' && s.name === 'create_user');
    expect(createUserFunc).toBeDefined();
    expect(createUserFunc?.metadata?.apiRoute).toEqual({ path: '/users', method: 'POST' });

    const userServiceClass = partialModel.symbols.find(s => s.kind === 'class' && s.name === 'UserService');
    expect(userServiceClass).toBeDefined();
    expect(userServiceClass?.metadata?.isService).toBe(true);
  });

  test('Extracts HTML symbols, scopes, containments, and candidates', async () => {
    const htmlProjPath = path.resolve('tests/fixtures/html-project');
    const parsedFiles = await parseProject(htmlProjPath);

    const htmlFile = parsedFiles.find(f => f.filePath === 'index.html');
    expect(htmlFile).toBeDefined();

    const extractor = extractorRegistry.getExtractor('html');
    const partialModel = extractor.extract(htmlFile!);

    expect(partialModel.filePath).toBe('index.html');

    // Symbols extracted: file itself, and two elements with IDs (app-root and header-title)
    expect(partialModel.symbols.length).toBe(3);

    const appRootSym = partialModel.symbols.find(s => s.kind === 'variable' && s.name === 'app-root');
    expect(appRootSym).toBeDefined();
    expect(appRootSym?.id).toBe('index.html::app-root');

    const headerSym = partialModel.symbols.find(s => s.kind === 'variable' && s.name === 'header-title');
    expect(headerSym).toBeDefined();
    expect(headerSym?.id).toBe('index.html::header-title');

    // References: 1 link element stylesheet, 1 script element
    expect(partialModel.references.length).toBe(2);
    const linkRef = partialModel.references.find(r => r.importPath === 'style.css');
    expect(linkRef).toBeDefined();
    expect(linkRef?.kind).toBe('import');

    const scriptRef = partialModel.references.find(r => r.importPath === 'app.js');
    expect(scriptRef).toBeDefined();
    expect(scriptRef?.kind).toBe('import');
  });

  test('Extracts JSX component-render references from TSX (and ignores host/HTML tags)', () => {
    const source = `
import { LegendSection } from './Legend';

function Dashboard() {
  return (
    <div className="wrap">
      <LegendSection title="x" />
      <span>plain host element</span>
      <Panel.Header />
    </div>
  );
}
`;
    const parser = parserRegistry.getParser('tsx');
    const tree = parser.parse(source);
    const extractor = extractorRegistry.getExtractor('tsx');
    const partialModel = extractor.extract({
      filePath: 'src/Dashboard.tsx',
      absolutePath: 'src/Dashboard.tsx',
      language: 'tsx',
      tree,
      sourceCode: source
    });

    const renders = partialModel.references.filter(r => r.kind === 'renders');
    const renderedNames = renders.map(r => r.rawName).sort();

    // Capitalized component <LegendSection> and member-expression <Panel.Header> captured;
    // lowercase host elements <div>/<span> are NOT.
    expect(renderedNames).toContain('LegendSection');
    expect(renders.some(r => r.qualifierChain.join('.') === 'Panel.Header')).toBe(true);
    expect(renderedNames).not.toContain('div');
    expect(renderedNames).not.toContain('span');

    // The render reference originates from the enclosing Dashboard component.
    const legendRef = renders.find(r => r.rawName === 'LegendSection');
    expect(legendRef?.fromSymbolId).toBe('src/Dashboard.tsx::Dashboard');
  });
});

