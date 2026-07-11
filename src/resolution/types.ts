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
export interface Disambiguation {
  query: string;
  chosen: ResolvedAnchor;
  alternatives: AnchorCandidate[];
}

export type MultiAnchorResolutionResult =
  | {
      status: 'resolved';
      anchors: ResolvedAnchor[];
      // Present when autoPick resolved one or more ambiguous queries to a best match.
      // Lets the caller surface "I picked X; you also could have meant Y, Z" transparently.
      disambiguations?: Disambiguation[];
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
