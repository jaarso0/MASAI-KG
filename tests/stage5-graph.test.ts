import { describe, test, expect } from 'vitest';
import { createSymbol, createContainment } from '../src/semantic-model/builder.js';
import { buildGraphFromModel, KnowledgeGraph } from '../src/graph/graph.js';
import { SemanticModel, ResolvedReference } from '../semantic-model/types.js';

describe('Stage 5 - Graph', () => {
  test('Graph correctly maps symbols, containments, and resolved references', () => {
    const projectSym = createSymbol({
      filePath: '',
      chain: ['my-proj'],
      kind: 'project',
      range: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
    });

    const fileSym = createSymbol({
      filePath: 'src/main.ts',
      chain: ['src/main.ts'],
      kind: 'file',
      range: { start: { line: 0, column: 0 }, end: { line: 100, column: 0 } }
    });

    const classSym = createSymbol({
      filePath: 'src/main.ts',
      chain: ['MyClass'],
      kind: 'class',
      range: { start: { line: 5, column: 0 }, end: { line: 20, column: 0 } }
    });

    const methodSym = createSymbol({
      filePath: 'src/main.ts',
      chain: ['MyClass', 'run'],
      kind: 'method',
      range: { start: { line: 8, column: 2 }, end: { line: 15, column: 2 } }
    });

    const callerSym = createSymbol({
      filePath: 'src/main.ts',
      chain: ['main'],
      kind: 'function',
      range: { start: { line: 30, column: 0 }, end: { line: 40, column: 0 } }
    });

    const containments = [
      createContainment(projectSym.id, fileSym.id, 'owns'),
      createContainment(fileSym.id, classSym.id, 'owns'),
      createContainment(classSym.id, methodSym.id, 'has_member'),
      createContainment(fileSym.id, callerSym.id, 'owns')
    ];

    const resolvedCall: ResolvedReference = {
      candidateId: 'ref1',
      fromSymbolId: callerSym.id,
      toSymbolId: methodSym.id,
      kind: 'call',
      resolutionMethod: 'scope'
    };

    const model: SemanticModel = {
      project: projectSym,
      symbols: [fileSym, classSym, methodSym, callerSym],
      scopes: [],
      containments,
      resolvedReferences: [resolvedCall],
      unresolvedReferences: [],
      diagnostics: [],
      projectRoot: '/root',
      createdAt: new Date().toISOString(),
      fileCount: 1,
      symbolCount: 4
    };

    const graph = buildGraphFromModel(model);

    // Assert correct nodes
    expect(graph.getAllNodes().length).toBe(5); // Project + 4 symbols
    expect(graph.getNode(classSym.id)).toBeDefined();
    expect(graph.getNode(methodSym.id)?.name).toBe('run');

    // Assert containments (owns, has_member)
    const members = graph.getMembersOf(classSym.id);
    expect(members.length).toBe(1);
    expect(members[0].id).toBe(methodSym.id);

    // Assert callers / callees
    const callers = graph.getCallersOf(methodSym.id);
    expect(callers.length).toBe(1);
    expect(callers[0].id).toBe(callerSym.id);

    const callees = graph.getCalleesOf(callerSym.id);
    expect(callees.length).toBe(1);
    expect(callees[0].id).toBe(methodSym.id);

    // Test stats
    const stats = graph.stats();
    expect(stats.nodes).toBe(5);
    expect(stats.edges).toBe(5); // 4 containments + 1 call edge
    expect(stats.byKind['owns']).toBe(3);
    expect(stats.byKind['has_member']).toBe(1);
    expect(stats.byKind['call']).toBe(1);
  });

  test('Inheritance chain walking and neighborhood BFS work perfectly', () => {
    const parentClass = createSymbol({
      filePath: 'app.ts',
      chain: ['Parent'],
      kind: 'class',
      range: { start: { line: 1, column: 0 }, end: { line: 5, column: 0 } }
    });

    const childClass = createSymbol({
      filePath: 'app.ts',
      chain: ['Child'],
      kind: 'class',
      range: { start: { line: 10, column: 0 }, end: { line: 15, column: 0 } }
    });

    const grandChildClass = createSymbol({
      filePath: 'app.ts',
      chain: ['GrandChild'],
      kind: 'class',
      range: { start: { line: 20, column: 0 }, end: { line: 25, column: 0 } }
    });

    const model: SemanticModel = {
      project: createSymbol({ filePath: '', chain: ['proj'], kind: 'project', range: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } }),
      symbols: [parentClass, childClass, grandChildClass],
      scopes: [],
      containments: [],
      resolvedReferences: [
        { candidateId: '1', fromSymbolId: childClass.id, toSymbolId: parentClass.id, kind: 'inherit', resolutionMethod: 'scope' },
        { candidateId: '2', fromSymbolId: grandChildClass.id, toSymbolId: childClass.id, kind: 'inherit', resolutionMethod: 'scope' }
      ],
      unresolvedReferences: [],
      diagnostics: [],
      projectRoot: '/root',
      createdAt: new Date().toISOString(),
      fileCount: 1,
      symbolCount: 3
    };

    const graph = buildGraphFromModel(model);

    // Inheritance walking
    const chain = graph.getInheritanceChain(grandChildClass.id);
    expect(chain.length).toBe(2);
    expect(chain[0].id).toBe(childClass.id);
    expect(chain[1].id).toBe(parentClass.id);

    // Neighborhood BFS (depth 1 from ChildClass should fetch ParentClass and GrandChildClass)
    const neighborhood = graph.getNeighborhood(childClass.id, 1);
    const nStats = neighborhood.stats();
    expect(nStats.nodes).toBe(3);
    expect(nStats.edges).toBe(2);
    expect(neighborhood.getNode(grandChildClass.id)).toBeDefined();
    expect(neighborhood.getNode(parentClass.id)).toBeDefined();
  });
});
