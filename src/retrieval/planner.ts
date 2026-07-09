import { RetrievalStrategy } from './types.js';

export class RetrievalPlanner {
  private locateKeywords = ['where', 'find', 'locate', 'exist', 'implement', 'defined', 'declare', 'file', 'symbol'];
  private flowKeywords = ['how', 'flow', 'run', 'execution', 'path', 'work', 'trace', 'call graph', 'process', 'step'];
  private impactKeywords = ['break', 'impact', 'modify', 'change', 'depend', 'caller', 'affect', 'refactor', 'use'];

  public plan(taskQuery: string): RetrievalStrategy {
    const qLower = taskQuery.toLowerCase();

    let locateScore = 0;
    let flowScore = 0;
    let impactScore = 0;

    for (const kw of this.locateKeywords) {
      if (qLower.includes(kw)) locateScore++;
    }
    for (const kw of this.flowKeywords) {
      if (qLower.includes(kw)) flowScore++;
    }
    for (const kw of this.impactKeywords) {
      if (qLower.includes(kw)) impactScore++;
    }

    if (impactScore > flowScore && impactScore > locateScore) {
      return 'impact';
    }
    if (flowScore > locateScore) {
      return 'flow';
    }
    return 'locate';
  }
}
