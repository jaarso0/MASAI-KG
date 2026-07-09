import Parser from 'tree-sitter';

export interface EndpointSpec {
  path: string;
  method: string;
}

export interface DataModelSpec {
  tableName: string;
}

export interface ServiceSpec {
  isService: boolean;
}

export interface FrameworkAdapter {
  name: string;
  detectEndpoint(node: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, filePath: string): EndpointSpec | null;
  detectDataModel(node: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, filePath: string): DataModelSpec | null;
  detectService(node: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, filePath: string): ServiceSpec | null;
}
