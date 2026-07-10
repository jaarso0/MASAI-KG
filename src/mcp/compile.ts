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
      requestedDepth: expand ? (args.depth ?? 2) : 0,
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
