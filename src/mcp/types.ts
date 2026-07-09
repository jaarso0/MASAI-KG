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
