import { describe, test, expect } from 'vitest';
import * as path from 'path';
import { Pipeline } from '../src/pipeline.js';

describe('End-to-End Integration Pipeline', () => {
  test('Runs pipeline on Python fixture and queries derived graph', async () => {
    const projectPath = path.resolve('tests/fixtures/python-project');
    const pipeline = new Pipeline();

    // 1. Run pipeline
    const model = await pipeline.buildFull(projectPath);

    expect(model.fileCount).toBe(3);
    expect(model.symbolCount).toBeGreaterThanOrEqual(5);

    // Verify important python symbols exist
    expect(model.symbols.some(s => s.id === 'services/user.py::UserService')).toBe(true);
    expect(model.symbols.some(s => s.id === 'services/user.py::UserService::save')).toBe(true);
    expect(model.symbols.some(s => s.id === 'admin/user.py::UserService::delete_user')).toBe(true);
    expect(model.symbols.some(s => s.id === 'main.py::run')).toBe(true);

    // Verify references got resolved
    // We expect main.py calls get_current_user, which should resolve to services/user.py::get_current_user
    const resolvedCalls = model.resolvedReferences.filter(r => r.kind === 'call');
    expect(resolvedCalls.length).toBeGreaterThanOrEqual(2);

    const callToGetCurrentUser = resolvedCalls.find(
      r => r.candidateId.includes('get_current_user')
    );
    expect(callToGetCurrentUser).toBeDefined();
    expect(callToGetCurrentUser?.toSymbolId).toBe('services/user.py::get_current_user');

    // 2. Derive Knowledge Graph
    const graph = pipeline.deriveGraph(model);
    
    // Query callers of services/user.py::get_current_user
    // Since get_current_user is called inside run() directly, its caller is main.py::run
    const callersOfGetCurrentUser = graph.getCallersOf('services/user.py::get_current_user');
    expect(callersOfGetCurrentUser.length).toBe(1);
    expect(callersOfGetCurrentUser[0].id).toBe('main.py::run');
  });

  test('Runs pipeline on TypeScript fixture and queries derived graph', async () => {
    const projectPath = path.resolve('tests/fixtures/typescript-project');
    const pipeline = new Pipeline();

    // 1. Run pipeline
    const model = await pipeline.buildFull(projectPath);

    expect(model.fileCount).toBe(3);
    
    // Verify important TS symbols exist
    expect(model.symbols.some(s => s.id === 'src/services/user.ts::UserService')).toBe(true);
    expect(model.symbols.some(s => s.id === 'src/models/user.ts::User')).toBe(true);
    expect(model.symbols.some(s => s.id === 'src/index.ts::main')).toBe(true);

    // Verify import reference from src/services/user.ts to src/models/user.ts::User is resolved
    const resolvedImports = model.resolvedReferences.filter(r => r.kind === 'import');
    expect(resolvedImports.length).toBeGreaterThanOrEqual(1);

    // Find import specifically for the User model (avoiding "UserService" substring issues)
    const userImport = resolvedImports.find(
      r => r.toSymbolId === 'src/models/user.ts::User'
    );
    expect(userImport).toBeDefined();
    expect(userImport?.resolutionMethod).toBe('import');

    // 2. Derive Knowledge Graph
    const graph = pipeline.deriveGraph(model);
    expect(graph.getAllNodes().length).toBeGreaterThan(3);

    // Query members of UserService class
    const members = graph.getMembersOf('src/services/user.ts::UserService');
    expect(members.length).toBeGreaterThanOrEqual(2);
    expect(members.some(m => m.name === 'save')).toBe(true);
    expect(members.some(m => m.name === 'getById')).toBe(true);
  });

  test('Runs pipeline on HTML fixture and resolves script imports', async () => {
    const projectPath = path.resolve('tests/fixtures/html-project');
    const pipeline = new Pipeline();

    // 1. Run pipeline
    const model = await pipeline.buildFull(projectPath);

    expect(model.fileCount).toBe(2);

    // Verify HTML and JS symbols exist
    expect(model.symbols.some(s => s.id === 'index.html::index.html')).toBe(true);
    expect(model.symbols.some(s => s.id === 'app.js::app.js')).toBe(true);
    expect(model.symbols.some(s => s.id === 'index.html::app-root')).toBe(true);

    // Verify references are resolved: HTML script src="app.js" should resolve to file "app.js"
    const resolvedImports = model.resolvedReferences.filter(r => r.kind === 'import');
    expect(resolvedImports.length).toBeGreaterThanOrEqual(1);

    const scriptImport = resolvedImports.find(
      r => r.toSymbolId === 'app.js::app.js'
    );
    expect(scriptImport).toBeDefined();
    expect(scriptImport?.resolutionMethod).toBe('import');
  });
});
