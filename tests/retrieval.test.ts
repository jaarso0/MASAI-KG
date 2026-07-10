import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createSymbol, createContainment } from '../src/semantic-model/builder.js';
import { buildGraphFromModel } from '../src/graph/graph.js';
import { SemanticModel } from '../src/semantic-model/types.js';
import { RetrievalEngine } from '../src/retrieval/api.js';
import { RetrievalPlanner } from '../src/retrieval/planner.js';
import { CandidateDiscovery } from '../src/retrieval/discovery.js';
import { GraphExpander } from '../src/retrieval/expander.js';

const TEMP_TEST_DIR = path.resolve('./temp-retrieval-test-project');

describe('Retrieval Layer', () => {
  let model: SemanticModel;
  let engine: RetrievalEngine;

  beforeAll(async () => {
    // 1. Create a mock project directory with temporary files for code snippet extraction
    await fs.mkdir(TEMP_TEST_DIR, { recursive: true });
    await fs.writeFile(
      path.join(TEMP_TEST_DIR, 'auth_service.py'),
      `class AuthService:
    def login(self, username, password):
        print("logging in " + username)
        return "token_123"

    def verify_mfa(self, token):
        # Multi factor auth verification
        return True
`
    );
    await fs.writeFile(
      path.join(TEMP_TEST_DIR, 'login_controller.py'),
      `from auth_service import AuthService

class LoginController:
    def handle_login(self, req):
        service = AuthService()
        return service.login(req.user, req.pw)
`
    );

    // 2. Build mock symbols
    const projectSym = createSymbol({
      filePath: '',
      chain: ['test-project'],
      kind: 'project',
      range: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
    });

    const fileAuth = createSymbol({
      filePath: 'auth_service.py',
      chain: ['auth_service.py'],
      kind: 'file',
      range: { start: { line: 0, column: 0 }, end: { line: 9, column: 0 } }
    });

    const fileController = createSymbol({
      filePath: 'login_controller.py',
      chain: ['login_controller.py'],
      kind: 'file',
      range: { start: { line: 0, column: 0 }, end: { line: 7, column: 0 } }
    });

    const authServiceClass = createSymbol({
      filePath: 'auth_service.py',
      chain: ['AuthService'],
      kind: 'class',
      range: { start: { line: 0, column: 0 }, end: { line: 9, column: 0 } },
      exported: true,
      metadata: { isService: true }
    });

    const loginMethod = createSymbol({
      filePath: 'auth_service.py',
      chain: ['AuthService', 'login'],
      kind: 'method',
      range: { start: { line: 1, column: 4 }, end: { line: 3, column: 27 } }
    });

    const mfaMethod = createSymbol({
      filePath: 'auth_service.py',
      chain: ['AuthService', 'verify_mfa'],
      kind: 'method',
      range: { start: { line: 5, column: 4 }, end: { line: 7, column: 19 } }
    });

    const controllerClass = createSymbol({
      filePath: 'login_controller.py',
      chain: ['LoginController'],
      kind: 'class',
      range: { start: { line: 2, column: 0 }, end: { line: 6, column: 43 } },
      exported: true,
      metadata: {
        apiRoute: { path: '/api/login', method: 'POST' }
      }
    });

    const handleLoginMethod = createSymbol({
      filePath: 'login_controller.py',
      chain: ['LoginController', 'handle_login'],
      kind: 'method',
      range: { start: { line: 3, column: 4 }, end: { line: 6, column: 43 } }
    });

    // 3. Build relations
    const containments = [
      createContainment(projectSym.id, fileAuth.id, 'owns'),
      createContainment(projectSym.id, fileController.id, 'owns'),
      createContainment(fileAuth.id, authServiceClass.id, 'owns'),
      createContainment(authServiceClass.id, loginMethod.id, 'has_member'),
      createContainment(authServiceClass.id, mfaMethod.id, 'has_member'),
      createContainment(fileController.id, controllerClass.id, 'owns'),
      createContainment(controllerClass.id, handleLoginMethod.id, 'has_member')
    ];

    const resolvedReferences = [
      {
        candidateId: 'ref_import',
        fromSymbolId: fileController.id,
        toSymbolId: fileAuth.id,
        kind: 'import' as const,
        resolutionMethod: 'import' as const
      },
      {
        candidateId: 'ref_call',
        fromSymbolId: handleLoginMethod.id,
        toSymbolId: loginMethod.id,
        kind: 'call' as const,
        resolutionMethod: 'scope' as const
      }
    ];

    model = {
      project: projectSym,
      symbols: [fileAuth, fileController, authServiceClass, loginMethod, mfaMethod, controllerClass, handleLoginMethod],
      scopes: [],
      containments,
      resolvedReferences,
      unresolvedReferences: [],
      diagnostics: [],
      projectRoot: TEMP_TEST_DIR,
      createdAt: new Date().toISOString(),
      fileCount: 2,
      symbolCount: 7
    };

    const graph = buildGraphFromModel(model);
    engine = new RetrievalEngine(graph, TEMP_TEST_DIR);
  });

  afterAll(async () => {
    await fs.rm(TEMP_TEST_DIR, { recursive: true, force: true });
  });

  test('Retrieval Indexes build and match symbols/kinds/endpoints/services', () => {
    const indexes = engine.getIndexes();

    // 1. Symbol Name lookup
    const foundAuth = indexes.bySymbolName.get('authservice');
    expect(foundAuth).toBeDefined();
    expect(foundAuth?.length).toBe(1);
    expect(foundAuth?.[0].kind).toBe('class');

    // 2. Kind lookup
    const methods = indexes.byKind.get('method');
    expect(methods?.length).toBe(3); // login, verify_mfa, handle_login

    // 3. Endpoint lookup
    const endpointNode = indexes.byEndpoint.get('POST /api/login');
    expect(endpointNode).toBeDefined();
    expect(endpointNode?.name).toBe('LoginController');

    // 4. Service lookup
    const serviceNode = indexes.byService.get('AuthService');
    expect(serviceNode).toBeDefined();
    expect(serviceNode?.kind).toBe('class');

    // 5. Reverse callers & dependencies
    const loginMethodId = 'auth_service.py::AuthService::login';
    const callers = indexes.reverseCallers.get(loginMethodId);
    expect(callers).toBeDefined();
    expect(callers?.length).toBe(1);
    expect(callers?.[0].sourceId).toBe('login_controller.py::LoginController::handle_login');
  });

  test('Retrieval Planner classifies queries into strategies', () => {
    const planner = engine.getPlanner();

    expect(planner.plan('Where is AuthService implemented?')).toBe('locate');
    expect(planner.plan('Find where verify_mfa is declared')).toBe('locate');

    expect(planner.plan('How does login flow work?')).toBe('flow');
    expect(planner.plan('Trace call paths for handle_login')).toBe('flow');

    expect(planner.plan('What breaks if I modify login method?')).toBe('impact');
    expect(planner.plan('What depends on AuthService?')).toBe('impact');
  });

  test('Candidate Discovery ranks nodes based on scores', () => {
    const discovery = engine.getDiscovery();

    // 1. Endpoint match
    const r1 = discovery.discover('POST /api/login');
    expect(r1[0].node.name).toBe('LoginController');
    expect(r1[0].score).toBeGreaterThanOrEqual(15);

    // 2. Exact Service Name match
    const r2 = discovery.discover('AuthService verify');
    expect(r2[0].node.name).toBe('AuthService');
  });

  test('Graph Expander BFS navigates edges correctly', () => {
    const graph = buildGraphFromModel(model);
    const expander = new GraphExpander(graph);

    // Starting from LoginController, depth 1 call traverse
    const result = expander.expand(['login_controller.py::LoginController::handle_login'], {
      maxDepth: 1,
      relationTypes: ['call'],
      maxNodes: 10
    });

    expect(result.nodes.some(n => n.name === 'login')).toBe(true);
    expect(result.edges.some(e => e.kind === 'call')).toBe(true);
  });

  test('End-to-End retrieveContext locates concepts and pulls code snippets', async () => {
    // 1. Locate search
    const package1 = await engine.retrieveContext('Where is verify_mfa defined?', { strategy: 'locate' });
    expect(package1.strategy).toBe('locate');
    expect(package1.relevantSymbols.some(s => s.name === 'verify_mfa')).toBe(true);
    expect(package1.relevantFiles.includes('auth_service.py')).toBe(true);

    // Verify snippet extraction
    const mfaSnippet = package1.codeSnippets.find(s => s.symbolName === 'verify_mfa');
    expect(mfaSnippet).toBeDefined();
    expect(mfaSnippet?.startLine).toBe(6);
    expect(mfaSnippet?.endLine).toBe(8);
    expect(mfaSnippet?.content).toContain('verify_mfa');
    expect(mfaSnippet?.content).toContain('Multi factor auth');

    // 2. Flow search
    const package2 = await engine.retrieveContext('How does the login flow execute?', { strategy: 'flow' });
    expect(package2.strategy).toBe('flow');
    expect(package2.executionFlows.length).toBe(1);
    expect(package2.executionFlows[0].length).toBe(1);
    expect(package2.executionFlows[0][0].fromName).toBe('LoginController.handle_login');
    expect(package2.executionFlows[0][0].toName).toBe('AuthService.login');
  });

  test('Incremental index update adds and removes files/nodes correctly', () => {
    const updatedServiceSymbol = createSymbol({
      filePath: 'auth_service.py',
      chain: ['AuthService'],
      kind: 'class',
      range: { start: { line: 0, column: 0 }, end: { line: 12, column: 0 } },
      exported: true,
      metadata: { isService: true, description: 'updated service' }
    });

    const newHelperSymbol = createSymbol({
      filePath: 'auth_service.py',
      chain: ['AuthService', 'helper_util'],
      kind: 'function',
      range: { start: { line: 10, column: 4 }, end: { line: 11, column: 15 } }
    });

    // 1. Update the file
    engine.updateFile('auth_service.py', [updatedServiceSymbol, newHelperSymbol], []);

    const indexes = engine.getIndexes();

    // Verify new helper symbol is indexed
    const helpers = indexes.bySymbolName.get('helper_util');
    expect(helpers).toBeDefined();
    expect(helpers?.length).toBe(1);
    expect(helpers?.[0].filePath).toBe('auth_service.py');

    // Verify old method is removed since it wasn't in the new update
    const oldMethod = indexes.bySymbolName.get('verify_mfa');
    expect(oldMethod?.length).toBe(0);

    // 2. Deletion update
    engine.updateFile('auth_service.py', [], [], true);
    const deletedHelper = indexes.bySymbolName.get('helper_util');
    expect(deletedHelper?.length).toBe(0);
  });
});
