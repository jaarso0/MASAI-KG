import { Language } from '../stage1-parse/lang-detect.js';
import { ParsedFile } from '../stage1-parse/parsed-file.js';
import { PartialSemanticModel } from '../semantic-model/types.js';
import { extractPartialModel } from './extract.js';

export class QueryExtractor {
  public extract(parsed: ParsedFile): PartialSemanticModel {
    return extractPartialModel(parsed);
  }
}

export class ExtractorRegistry {
  private extractors = new Map<Language, QueryExtractor>();

  constructor() {
    const queryExtractor = new QueryExtractor();
    this.extractors.set('typescript', queryExtractor);
    this.extractors.set('tsx', queryExtractor);
    this.extractors.set('javascript', queryExtractor);
    this.extractors.set('jsx', queryExtractor);
    this.extractors.set('python', queryExtractor);
    this.extractors.set('java', queryExtractor);
    this.extractors.set('html', queryExtractor);
  }

  public getExtractor(lang: Language): QueryExtractor {
    const extractor = this.extractors.get(lang);
    if (!extractor) {
      throw new Error(`No extractor registered for language: ${lang}`);
    }
    return extractor;
  }
}

export const extractorRegistry = new ExtractorRegistry();
