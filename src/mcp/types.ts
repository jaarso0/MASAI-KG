import { SymbolKind } from '../semantic-model/types.js';

export type Operation = 'region' | 'path' | 'impact';

export interface AnchorSpec {
  query: string;
  kind?: SymbolKind;
  resolution?: 'exact' | 'search' | 'auto';
}

export interface GraphQueryPlan {
  operation: Operation;
  anchors: AnchorSpec[];
  constraints?: {
    direction?: 'incoming' | 'outgoing' | 'both';
    edgeKinds?: string[];
    requestedDepth?: number;
    requestedNodes?: number;
    requestedPaths?: number;
    /**
     * Marks this plan as originating from `search_symbols`. On an ambiguous anchor,
     * the controller returns a flat candidate list instead of the "ambiguous" error
     * shape, regardless of requestedDepth — search returning multiple matches isn't
     * an error, it's the expected result of a broad query. Decoupled from
     * requestedDepth so search_symbols can still request a real neighborhood depth
     * for the single-match case without losing its distinct ambiguous-result shape.
     */
    searchMode?: boolean;
  };
  materialize?: {
    source?: boolean;
    callsites?: boolean;
    signatures?: boolean;
    docs?: boolean;
  };
  context?: {
    tokenBudget?: number;
  };
}

export interface SearchSymbolsArgs {
  query: string;
  kind?: SymbolKind;
  /** When the query resolves to exactly one symbol, also explore its neighborhood instead of returning bare candidate info. Default true. */
  expand?: boolean;
  /** Neighborhood depth used when `expand` is true and there's a single match. Default 2. */
  depth?: number;
}

export interface ExploreRegionArgs {
  anchor: string;
  direction?: 'incoming' | 'outgoing' | 'both';
  depth?: number;
  edgeKinds?: string[];
}

export interface TracePathArgs {
  from: string;
  to: string;
  edgeKinds?: string[];
  maxDepth?: number;
}

export interface AnalyzeImpactArgs {
  anchor: string;
  maxDepth?: number;
}
