import {
  GraphQueryPlan,
  SearchSymbolsArgs,
  ExploreRegionArgs,
  TracePathArgs,
  AnalyzeImpactArgs
} from './types.js';

export function compileSearchSymbols(args: SearchSymbolsArgs): GraphQueryPlan {
  const expand = args.expand !== false;
  return {
    operation: 'region',
    anchors: [
      {
        query: args.query,
        kind: args.kind,
        resolution: 'auto'
      }
    ],
    constraints: {
      direction: 'both',
      // 0 when not expanding (bare candidate/anchor info only); otherwise a real
      // neighborhood depth so a single unambiguous match doubles as an explore_region
      // call — searchMode keeps ambiguous multi-match results returning the flat
      // candidate list either way (see GraphQueryPlan.constraints.searchMode).
      // Depth kept at 1 (not 2) and node count well below explore_region's default:
      // depth 2/both on a heavily-referenced symbol (a common utility class, say) can
      // fan out into hundreds of edges — observed producing a 75K+ character response
      // that exceeded the caller's token limit entirely. This is meant to be a cheap
      // "what is this and who touches it directly" convenience, not a full traversal;
      // callers who want more should follow up with explore_region.
      requestedDepth: expand ? (args.depth ?? 1) : 0,
      requestedNodes: expand ? 40 : undefined,
      searchMode: true
    },
    materialize: {
      source: expand,
      callsites: expand,
      signatures: true,
      docs: true
    }
  };
}

export function compileExploreRegion(args: ExploreRegionArgs): GraphQueryPlan {
  return {
    operation: 'region',
    anchors: [
      {
        query: args.anchor,
        resolution: 'auto'
      }
    ],
    constraints: {
      direction: args.direction || 'outgoing',
      requestedDepth: args.depth !== undefined ? args.depth : 3,
      edgeKinds: args.edgeKinds
    },
    materialize: {
      source: true,
      callsites: true,
      signatures: true,
      docs: true
    }
  };
}

export function compileTracePath(args: TracePathArgs): GraphQueryPlan {
  return {
    operation: 'path',
    anchors: [
      {
        query: args.from,
        resolution: 'auto'
      },
      {
        query: args.to,
        resolution: 'auto'
      }
    ],
    constraints: {
      edgeKinds: args.edgeKinds,
      requestedDepth: args.maxDepth !== undefined ? args.maxDepth : 6
    },
    materialize: {
      source: true,
      callsites: true,
      signatures: true,
      docs: true
    }
  };
}

export function compileAnalyzeImpact(args: AnalyzeImpactArgs): GraphQueryPlan {
  return {
    operation: 'impact',
    anchors: [
      {
        query: args.anchor,
        resolution: 'auto'
      }
    ],
    constraints: {
      requestedDepth: args.maxDepth !== undefined ? args.maxDepth : 3
    },
    materialize: {
      source: true,
      callsites: true,
      signatures: true,
      docs: true
    }
  };
}
