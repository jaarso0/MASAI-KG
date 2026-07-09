export interface ResolvedAnchor {
  nodeId: string;
  name: string;
  qualifiedName: string;
  file: string;
}

export interface AnchorCandidate {
  nodeId: string;
  name: string;
  qualifiedName: string;
  file: string;
  score?: number;
  matchReasons?: string[];
}

export type ResolutionResult =
  | {
      status: 'resolved';
      anchors: ResolvedAnchor[];
    }
  | {
      status: 'ambiguous';
      candidates: AnchorCandidate[];
    }
  | {
      status: 'not_found';
      query: string;
    };
export type MultiAnchorResolutionResult =
  | {
      status: 'resolved';
      anchors: ResolvedAnchor[];
    }
  | {
      status: 'ambiguous';
      // Maps anchor query to its candidate list if it was ambiguous
      ambiguousAnchors: Array<{
        query: string;
        candidates: AnchorCandidate[];
      }>;
    }
  | {
      status: 'not_found';
      missingQueries: string[];
    };
