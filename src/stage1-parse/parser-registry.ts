import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';
import Java from 'tree-sitter-java';
import HTML from 'tree-sitter-html';
import pkg from 'tree-sitter-typescript';
import { Language } from './lang-detect.js';

const { typescript: TypeScript, tsx: TSX } = pkg;

export class ParserRegistry {
  private parsers = new Map<Language, Parser>();

  public getParser(lang: Language): Parser {
    let parser = this.parsers.get(lang);
    if (!parser) {
      parser = new Parser();
      const languageObj = this.getLanguageObject(lang);
      parser.setLanguage(languageObj);
      this.parsers.set(lang, parser);
    }
    return parser;
  }

  public hasParser(lang: Language): boolean {
    return this.parsers.has(lang);
  }

  private getLanguageObject(lang: Language): any {
    switch (lang) {
      case 'javascript':
      case 'jsx':
        return JavaScript;
      case 'python':
        return Python;
      case 'typescript':
        return TypeScript;
      case 'tsx':
        return TSX;
      case 'java':
        return Java;
      case 'html':
        return HTML;
      default:
        throw new Error(`Unsupported language: ${lang}`);
    }
  }
}

// Single export of lazy parser registry
export const parserRegistry = new ParserRegistry();
