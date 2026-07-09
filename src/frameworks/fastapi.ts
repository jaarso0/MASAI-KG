import Parser from 'tree-sitter';
import { FrameworkAdapter, EndpointSpec, DataModelSpec, ServiceSpec } from './types.js';

export const FastAPIAdapter: FrameworkAdapter = {
  name: 'fastapi',

  detectEndpoint(node: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, filePath: string): EndpointSpec | null {
    if (!filePath.endsWith('.py')) return null;
    if (node.type !== 'function_definition') return null;

    // Check if parent is decorated_definition
    if (node.parent && node.parent.type === 'decorated_definition') {
      const decorators = node.parent.children.filter((c) => c.type === 'decorator');
      for (const decorator of decorators) {
        const text = decorator.text;
        // Match @app.post("/path") or @router.get("/path")
        const match = text.match(/@(?:[a-zA-Z_][a-zA-Z0-9_]*)\.(get|post|put|delete|patch|options|head|api_route)\(\s*(['"])(.*?)\2/);
        if (match) {
          let method = match[1].toUpperCase();
          const path = match[3];

          if (method === 'API_ROUTE') {
            // Try to extract methods argument, e.g. methods=["POST"]
            const methodsMatch = text.match(/methods\s*=\s*\[\s*(['"])(.*?)\1\s*\]/);
            method = methodsMatch ? methodsMatch[2].toUpperCase() : 'GET';
          }

          return { path, method };
        }
      }
    }

    return null;
  },

  detectDataModel(node: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, filePath: string): DataModelSpec | null {
    if (!filePath.endsWith('.py')) return null;
    if (node.type !== 'class_definition') return null;

    // Check inheritance for Base or DeclarativeBase
    let inheritsFromBase = false;
    const argList = node.childForFieldName('superclasses');
    if (argList) {
      const text = argList.text;
      if (text.includes('Base') || text.includes('DeclarativeBase')) {
        inheritsFromBase = true;
      }
    }

    // Check for __tablename__ assignment in class body
    let tableName: string | null = null;
    const body = node.childForFieldName('body');
    if (body) {
      // Traverse body children to find __tablename__ = "..."
      for (let i = 0; i < body.childCount; i++) {
        const child = body.child(i);
        if (child && child.type === 'expression_statement') {
          const assignment = child.child(0);
          if (assignment && assignment.type === 'assignment') {
            const left = assignment.childForFieldName('left');
            const right = assignment.childForFieldName('right');
            if (left && left.text === '__tablename__' && right) {
              tableName = right.text.replace(/^['"]|['"]$/g, '');
              break;
            }
          }
        }
      }
    }

    if (inheritsFromBase || tableName) {
      const className = node.childForFieldName('name')?.text || '';
      return { tableName: tableName || className.toLowerCase() };
    }

    return null;
  },

  detectService(node: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, filePath: string): ServiceSpec | null {
    if (!filePath.endsWith('.py')) return null;
    if (node.type !== 'class_definition') return null;

    const className = node.childForFieldName('name')?.text || '';
    const isService = className.endsWith('Service') || filePath.toLowerCase().includes('service');

    return isService ? { isService: true } : null;
  }
};
