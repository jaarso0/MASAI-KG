import Parser from 'tree-sitter';
import { Language } from './lang-detect.js';

export interface ParsedFile {
  filePath: string;          // relative to project root (normalized)
  absolutePath: string;      // absolute path (normalized)
  language: Language;
  tree: Parser.Tree;         // tree-sitter AST
  sourceCode: string;        // raw source (needed for text extraction)
}
