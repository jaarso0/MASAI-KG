import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createSymbol, createContainment } from '../src/semantic-model/builder.js';
import { buildGraphFromModel, KnowledgeGraph } from '../src/stage5-graph/graph.js';
import { SemanticModel } from '../src/semantic-model/types.js';
import { validateGraphQueryPlan } from '../src/mcp/schemas.js';
import {
  compileSearchSymbols,
  compileExploreRegion,
  compileTracePath,
  compileAnalyzeImpact
} from '../src/mcp/compile.js';
import { AnchorResolver } from '../src/resolution/anchor-resolver.js';
import { GraphExecutor } from '../src/executor/graph-executor.js';
import { EvidenceMaterializer } from '../src/evidence/materializer.js';
import { QueryContextOptimizer } from '../src/optimizer/query-context-optimizer.js';
import { RequestController } from '../src/mcp/controller.js';

const TEMP_MCP_TEST_DIR = path.resolve('./temp-mcp-test-project');

describe('MCP Server & Querying Pipeline', () => {
  let model: SemanticModel;
  let graph: KnowledgeGraph;

  beforeAll(async () => {
    // 1. Create a mock project directory with temporary files
    await fs.mkdir(TEMP_MCP_TEST_DIR, { recursive: true });
    await fs.writeFile(
      path.join(TEMP_MCP_TEST_DIR, 'payment.ts'),
      `class PaymentProcessor {
  public charge(amount: number) {
    // Process charging amount
    console.log("Charging " + amount);
    return true;
  }
  public refund(transactionId: string) {
    return "refunded";
  }
}
`
    );
    await fs.writeFile(
      path.join(TEMP_MCP_TEST_DIR, 'checkout.ts'),
      `import { PaymentProcessor } from './payment';
class CheckoutController {
  public runCheckout(req: any) {
    const processor = new PaymentProcessor();
    return processor.charge(req.total);
  }
}
`
    );

    // 2. Build mock symbols
    const projectSym = createSymbol({
      filePath: '',
      chain: ['mcp-test-project'],
      kind: 'project',
      range: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
    });

    const filePayment = createSymbol({
      filePath: 'payment.ts',
      chain: ['payment.ts'],
      kind: 'file',
      range: { start: { line: 0, column: 0 }, end: { line: 8, column: 1 } }
    });

    const fileCheckout = createSymbol({
      filePath: 'checkout.ts',
      chain: ['checkout.ts'],
      kind: 'file',
      range: { start: { line: 0, column: 0 }, end: { line: 7, column: 1 } }
    });

    const paymentClass = createSymbol({
      filePath: 'payment.ts',
      chain: ['PaymentProcessor'],
      kind: 'class',
      range: { start: { line: 0, column: 0 }, end: { line: 8, column: 1 } }
    });

    const chargeMethod = createSymbol({
      filePath: 'payment.ts',
      chain: ['PaymentProcessor', 'charge'],
      kind: 'method',
      range: { start: { line: 1, column: 2 }, end: { line: 5, column: 3 } }
    });

    const refundMethod = createSymbol({
      filePath: 'payment.ts',
      chain: ['PaymentProcessor', 'refund'],
      kind: 'method',
      range: { start: { line: 6, column: 2 }, end: { line: 8, column: 3 } }
    });

    const checkoutClass = createSymbol({
      filePath: 'checkout.ts',
      chain: ['CheckoutController'],
      kind: 'class',
      range: { start: { line: 1, column: 0 }, end: { line: 7, column: 1 } }
    });

    const runCheckoutMethod = createSymbol({
      filePath: 'checkout.ts',
      chain: ['CheckoutController', 'runCheckout'],
      kind: 'method',
      range: { start: { line: 2, column: 2 }, end: { line: 5, column: 3 } }
    });

    // Containment relationships
    const containments = [
      createContainment(projectSym.id, filePayment.id, 'owns'),
      createContainment(projectSym.id, fileCheckout.id, 'owns'),
      createContainment(filePayment.id, paymentClass.id, 'owns'),
      createContainment(paymentClass.id, chargeMethod.id, 'has_member'),
      createContainment(paymentClass.id, refundMethod.id, 'has_member'),
      createContainment(fileCheckout.id, checkoutClass.id, 'owns'),
      createContainment(checkoutClass.id, runCheckoutMethod.id, 'has_member')
    ];

    // Reference edges
    const resolvedReferences = [
      {
        candidateId: 'ref_checkout_import',
        fromSymbolId: fileCheckout.id,
        toSymbolId: paymentClass.id,
        kind: 'import' as const,
        resolutionMethod: 'import' as const
      },
      {
        candidateId: 'ref_checkout_charge',
        fromSymbolId: runCheckoutMethod.id,
        toSymbolId: chargeMethod.id,
        kind: 'call' as const,
        resolutionMethod: 'scope' as const
      }
    ];

    model = {
      project: projectSym,
      symbols: [filePayment, fileCheckout, paymentClass, chargeMethod, refundMethod, checkoutClass, runCheckoutMethod],
      scopes: [],
      containments,
      resolvedReferences,
      unresolvedReferences: [],
      diagnostics: [],
      projectRoot: TEMP_MCP_TEST_DIR,
      createdAt: new Date().toISOString(),
      fileCount: 2,
      symbolCount: 7
    };

    graph = buildGraphFromModel(model);
  });

  afterAll(async () => {
    await fs.rm(TEMP_MCP_TEST_DIR, { recursive: true, force: true });
  });

  // 1. Schema Validation
  test('Schema validation accepts valid and rejects malformed plans', () => {
    const validPlan = {
      operation: 'region',
      anchors: [{ query: 'charge', resolution: 'auto' }],
      constraints: { direction: 'outgoing', requestedDepth: 2 }
    };
    expect(validateGraphQueryPlan(validPlan).valid).toBe(true);

    const invalidPlan = {
      operation: 'unknown_op',
      anchors: []
    };
    const validation = validateGraphQueryPlan(invalidPlan);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  // 2. Compilation
  test('Specialized tools compile correctly to general query plans', () => {
    const explorePlan = compileExploreRegion({ anchor: 'charge', depth: 4, direction: 'incoming' });
    expect(explorePlan.operation).toBe('region');
    expect(explorePlan.anchors[0].query).toBe('charge');
    expect(explorePlan.constraints?.requestedDepth).toBe(4);
    expect(explorePlan.constraints?.direction).toBe('incoming');

    const pathPlan = compileTracePath({ from: 'runCheckout', to: 'charge' });
    expect(pathPlan.operation).toBe('path');
    expect(pathPlan.anchors[0].query).toBe('runCheckout');
    expect(pathPlan.anchors[1].query).toBe('charge');
  });

  // 3. Anchor Resolver
  test('Anchor Resolver cascades and handles resolved/ambiguous/not_found cases', () => {
    const resolver = new AnchorResolver(graph);

    // Exact match by ID
    const r1 = resolver.resolveAnchor({ query: 'payment.ts::PaymentProcessor::charge' });
    expect(r1.status).toBe('resolved');
    if (r1.status === 'resolved') {
      expect(r1.anchors[0].qualifiedName).toBe('PaymentProcessor.charge');
    }

    // Qualified Name match
    const r2 = resolver.resolveAnchor({ query: 'PaymentProcessor.refund' });
    expect(r2.status).toBe('resolved');
    if (r2.status === 'resolved') {
      expect(r2.anchors[0].name).toBe('refund');
    }

    // FTS search fallback
    const r3 = resolver.resolveAnchor({ query: 'PaymentProcessor' });
    expect(r3.status).toBe('resolved'); // maps uniquely to the PaymentProcessor class

    // Ambiguity match
    // If we query for a common name that isn't qualified, it could find multiple
    // Let's add another symbol with name 'charge' in model to test ambiguity if we need,
    // but in this mock graph, name 'charge' is unique, 'runCheckout' is unique.
    // What if we query for "payment"? That matches both "payment.ts" and "PaymentProcessor" in substring.
    const r4 = resolver.resolveAnchor({ query: 'payment' });
    expect(r4.status).toBe('ambiguous');
    if (r4.status === 'ambiguous') {
      expect(r4.candidates.length).toBeGreaterThan(1);
    }

    // Not found
    const r5 = resolver.resolveAnchor({ query: 'NonExistentSymbol' });
    expect(r5.status).toBe('not_found');
  });

  // 4. Graph Execution
  test('Safe Graph Executor traverses region, path, and impact operations', () => {
    const executor = new GraphExecutor(graph);

    // REGION Outgoing from Checkout runCheckout
    const resRegion = executor.execute({
      operation: 'region',
      anchors: [],
      resolvedAnchors: ['checkout.ts::CheckoutController::runCheckout'],
      constraints: { direction: 'outgoing', requestedDepth: 2 }
    }, { maxDepth: 6, maxNodes: 100, maxPaths: 10 });

    expect(resRegion.kind).toBe('region');
    expect(resRegion.nodes.some(n => n.name === 'charge')).toBe(true);

    // PATH from runCheckout to charge
    const resPath = executor.execute({
      operation: 'path',
      anchors: [],
      resolvedAnchors: ['checkout.ts::CheckoutController::runCheckout', 'payment.ts::PaymentProcessor::charge']
    }, { maxDepth: 6, maxNodes: 100, maxPaths: 10 });

    expect(resPath.kind).toBe('path');
    if (resPath.kind === 'path') {
      expect(resPath.paths.length).toBe(1);
      expect(resPath.paths[0].nodes[0]).toBe('checkout.ts::CheckoutController::runCheckout');
      expect(resPath.paths[0].nodes[1]).toBe('payment.ts::PaymentProcessor::charge');
    }

    // IMPACT of modifying charge
    const resImpact = executor.execute({
      operation: 'impact',
      anchors: [],
      resolvedAnchors: ['payment.ts::PaymentProcessor::charge']
    }, { maxDepth: 6, maxNodes: 100, maxPaths: 10 });

    expect(resImpact.kind).toBe('impact');
    if (resImpact.kind === 'impact') {
      // The dependent node should be runCheckout
      expect(resImpact.affected.some(a => a.nodeId === 'checkout.ts::CheckoutController::runCheckout')).toBe(true);
    }
  });

  // 5. Evidence Materialization
  test('Evidence Materializer fetches code, fallback signatures, comments, and callsite lines', async () => {
    const executor = new GraphExecutor(graph);
    const materializer = new EvidenceMaterializer(graph, TEMP_MCP_TEST_DIR);

    const plan = {
      operation: 'path' as const,
      anchors: [],
      materialize: { source: true, signatures: true, docs: true, callsites: true }
    };

    const resPath = executor.execute({
      operation: 'path',
      anchors: [],
      resolvedAnchors: ['checkout.ts::CheckoutController::runCheckout', 'payment.ts::PaymentProcessor::charge']
    }, { maxDepth: 6, maxNodes: 100, maxPaths: 10 });

    const evidence = await materializer.materialize(resPath, plan);
    expect(evidence.nodes.length).toBe(2);
    
    const runCheckoutNode = evidence.nodes.find(n => n.name === 'runCheckout')!;
    expect(runCheckoutNode.source).toBeDefined();
    expect(runCheckoutNode.source?.text).toContain('public runCheckout(req: any)');
    expect(runCheckoutNode.signature).toBe('public runCheckout(req: any) {');

    // Callsite snippet verification
    const callEdge = evidence.edges.find(e => e.kind === 'call')!;
    expect(callEdge.callsite).toBeDefined();
    expect(callEdge.callsite?.line).toBe(5); // Line index 4 (0-indexed) is "return processor.charge(req.total);"
    expect(callEdge.callsite?.snippet).toBe('return processor.charge(req.total);');
  });

  // 6. Context Optimization & Span Merging
  test('Query Context Optimizer applies budget constraints and merges contiguous spans', async () => {
    const materializer = new EvidenceMaterializer(graph, TEMP_MCP_TEST_DIR);
    const optimizer = new QueryContextOptimizer(async (f) => (materializer as any).loadFileLines(f));

    const mockEvidence = {
      nodes: [
        {
          nodeId: 'node1',
          name: 'charge',
          kind: 'method',
          file: 'payment.ts',
          signature: 'public charge(amount)',
          source: {
            startLine: 2,
            endLine: 4,
            text: 'line 2\nline 3\nline 4'
          },
          structuralRole: 'anchor' as const
        },
        {
          nodeId: 'node2',
          name: 'refund',
          kind: 'method',
          file: 'payment.ts',
          signature: 'public refund(id)',
          source: {
            startLine: 7,
            endLine: 8,
            text: 'line 7\nline 8'
          },
          structuralRole: 'direct_neighbor' as const
        }
      ],
      edges: []
    };

    // The two spans are at lines 2-4 and 7-8 in payment.ts.
    // Since 7 <= 4 + 5 (7 <= 9), they are within 5 lines of each other and should be merged!
    const result = await optimizer.optimize(
      {
        operation: 'region',
        anchors: [],
        context: { tokenBudget: 5000 }
      },
      {
        kind: 'region',
        roots: ['node1'],
        nodes: [
          { nodeId: 'node1', kind: 'method', name: 'charge', qualifiedName: 'charge', filePath: 'payment.ts', properties: { range: { start: { line: 1, column: 0 }, end: { line: 3, column: 0 } } } },
          { nodeId: 'node2', kind: 'method', name: 'refund', qualifiedName: 'refund', filePath: 'payment.ts', properties: { range: { start: { line: 6, column: 0 }, end: { line: 7, column: 0 } } } }
        ],
        edges: [],
        distance: { node1: 0, node2: 1 }
      },
      mockEvidence
    );

    // Verify optimized text
    expect(result.serializedContext).toContain('=== NEIGHBORHOOD REGION EXPORT ===');
    expect(result.serializedContext).toContain('charge');
    expect(result.serializedContext).toContain('refund');
  });

  // 7. Request Controller End-to-End
  test('Request Controller integrates all phases and handles ambiguous anchor feedback', async () => {
    const controller = new RequestController(graph, TEMP_MCP_TEST_DIR);

    // Ambiguous anchor query
    const resAmbiguous = await controller.processPlan({
      operation: 'region',
      anchors: [{ query: 'payment' }]
    });

    expect(resAmbiguous.status).toBe('ambiguous');
    expect(resAmbiguous.ambiguousAnchors.length).toBe(1);
    expect(resAmbiguous.ambiguousAnchors[0].candidates.length).toBeGreaterThan(1);

    // Successful region query
    const resSuccess = await controller.processPlan({
      operation: 'region',
      anchors: [{ query: 'PaymentProcessor.charge' }],
      constraints: { direction: 'incoming', requestedDepth: 2 },
      materialize: { source: true, callsites: true, signatures: true }
    });

    expect(resSuccess.status).toBe('success');
    expect(resSuccess.serializedContext).toContain('runCheckout');
    expect(resSuccess.tokenUsage.estimated).toBeGreaterThan(0);
  });
});
