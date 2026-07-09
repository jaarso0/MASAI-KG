export interface LineSpan {
  startLine: number; // 1-indexed
  endLine: number;   // 1-indexed
  text: string;
}

/**
 * Merges overlapping or closely adjacent line spans in a file to reduce token overhead.
 * Spans within 5 lines of each other are merged.
 */
export function mergeSpans(spans: LineSpan[], fileLines: string[]): LineSpan[] {
  if (spans.length === 0) return [];

  // Sort by startLine ascending
  const sorted = [...spans].sort((a, b) => a.startLine - b.startLine);
  const merged: LineSpan[] = [];

  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    // If the next span starts within 5 lines of current span's end
    if (next.startLine <= current.endLine + 5) {
      current.endLine = Math.max(current.endLine, next.endLine);
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);

  // Populate the text for each merged span from the original file lines
  return merged.map(span => {
    const startIdx = Math.max(0, span.startLine - 1);
    const endIdx = Math.min(fileLines.length - 1, span.endLine - 1);
    const sliced = fileLines.slice(startIdx, endIdx + 1);
    return {
      startLine: span.startLine,
      endLine: span.endLine,
      text: sliced.join('\n')
    };
  });
}
