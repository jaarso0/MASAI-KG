import Parser from 'tree-sitter';

export interface Capture {
  tag: string;             // e.g. "definition.class", "definition.function", "call", "import"
  name: string;            // the text of the nameNode
  node: Parser.SyntaxNode; // the outer node matching the pattern (e.g. class_definition)
  nameNode: Parser.SyntaxNode; // the inner node containing the identifier (e.g. name field)
}
