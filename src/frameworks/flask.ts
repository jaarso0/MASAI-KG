import Parser from 'tree-sitter';
import { FrameworkAdapter, EndpointSpec, DataModelSpec, ServiceSpec } from './types.js';

export const FlaskAdapter: FrameworkAdapter = {
  name: 'flask',

  detectEndpoint(node: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, filePath: string): EndpointSpec | null {
    if (!filePath.endsWith('.py')) return null;
    if (node.type !== 'function_definition') return null;

    if (node.parent && node.parent.type === 'decorated_definition') {
      const decorators = node.parent.children.filter((c) => c.type === 'decorator');
      for (const decorator of decorators) {
        const text = decorator.text;
        // Matches @app.route("/path") or @bp.route("/path")
        const routeMatch = text.match(/@(?:[a-zA-Z_][a-zA-Z0-9_]*)\.route\(\s*(['"])(.*?)\1/);
        if (routeMatch) {
          const path = routeMatch[2];
          // Try to extract methods argument, e.g. methods=['POST', 'GET']
          const methodsMatch = text.match(/methods\s*=\s*\[\s*(.*?)\s*\]/);
          let method = 'GET';
          if (methodsMatch) {
            // Find all quoted words inside methods list
            const methods = Array.from(methodsMatch[1].matchAll(/['"]([a-zA-Z]+)['"]/g)).map(m => m[1].toUpperCase());
            if (methods.length > 0) {
              // Standardize to the first method found, or join them (typically GET or POST is queried)
              method = methods[0];
            }
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

    let inheritsFromModel = false;
    const argList = node.childForFieldName('superclasses');
    if (argList) {
      const text = argList.text;
      if (text.includes('db.Model') || text.includes('Model')) {
        inheritsFromModel = true;
      }
    }

    // Check for __tablename__ assignment in class body
    let tableName: string | null = null;
    const body = node.childForFieldName('body');
    if (body) {
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

    if (inheritsFromModel || tableName) {
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
