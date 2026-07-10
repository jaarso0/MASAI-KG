import Parser from 'tree-sitter';
import { Capture } from './facts.js';
import { parserRegistry } from '../parse/parser-registry.js';

/**
 * Runs a declarative tree-sitter query against the given AST tree and returns captures.
 */
export function runTreeSitterQuery(
  tree: Parser.Tree,
  language: string,
  querySource: string
): Capture[] {
  try {
    const parser = parserRegistry.getParser(language as any);
    const languageObj = parser.getLanguage();
    if (!languageObj) {
      throw new Error(`Failed to retrieve language object for ${language}`);
    }

    const query = new Parser.Query(languageObj, querySource);
    const matches = query.matches(tree.rootNode);

    const facts: Capture[] = [];

    for (const match of matches) {
      // Find the tag capture (e.g. definition.class, call, etc.)
      const tagCapture = match.captures.find(
        (c: any) => c.name !== 'name'
      );
      // Find the name capture
      const nameCapture = match.captures.find(
        (c: any) => c.name === 'name'
      );

      if (tagCapture) {
        const nameNode = nameCapture ? nameCapture.node : tagCapture.node;
        facts.push({
          tag: tagCapture.name,
          name: nameNode.text,
          node: tagCapture.node,
          nameNode: nameNode
        });
      }
    }

    return facts;
  } catch (err: any) {
    console.error(`Error running tree-sitter query for ${language}:`, err);
    return [];
  }
}
