import Parser from 'tree-sitter';
import { FrameworkAdapter, EndpointSpec, DataModelSpec, ServiceSpec } from './types.js';

export const ExpressAdapter: FrameworkAdapter = {
  name: 'express',

  detectEndpoint(node: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, filePath: string): EndpointSpec | null {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx') && !filePath.endsWith('.js') && !filePath.endsWith('.jsx')) return null;

    let handlerName = '';
    if (node.type === 'function_declaration') {
      handlerName = node.childForFieldName('name')?.text || '';
    } else if (node.type === 'method_definition') {
      handlerName = node.childForFieldName('name')?.text || '';
    } else if (node.type === 'variable_declarator') {
      handlerName = node.childForFieldName('name')?.text || '';
    }

    if (!handlerName) return null;

    // Traverse rootNode to find Express app/router calls referencing handlerName
    const stack: Parser.SyntaxNode[] = [rootNode];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current.type === 'call_expression') {
        const func = current.childForFieldName('function');
        if (func && func.type === 'member_expression') {
          const obj = func.childForFieldName('object');
          const prop = func.childForFieldName('property');
          if (obj && prop) {
            const objText = obj.text;
            const propText = prop.text;
            // Common Express receiver patterns
            if (
              (objText.toLowerCase().includes('app') || objText.toLowerCase().includes('router') || objText.toLowerCase().includes('route')) &&
              ['get', 'post', 'put', 'delete', 'patch', 'use'].includes(propText.toLowerCase())
            ) {
              const argsNode = current.childForFieldName('arguments');
              if (argsNode && argsNode.childCount > 0) {
                let path: string | null = null;
                let matchesHandler = false;
                for (let i = 0; i < argsNode.childCount; i++) {
                  const arg = argsNode.child(i);
                  if (!arg) continue;
                  if (arg.type === 'string') {
                    path = arg.text.replace(/^['"]|['"]$/g, '');
                  } else {
                    const argText = arg.text;
                    // Check if it matches exactly or is controller.handlerName
                    if (argText === handlerName || argText.endsWith('.' + handlerName)) {
                      matchesHandler = true;
                    }
                  }
                }
                if (matchesHandler && path !== null) {
                  return { path, method: propText.toUpperCase() };
                }
              }
            }
          }
        }
      }

      for (let i = current.childCount - 1; i >= 0; i--) {
        const child = current.child(i);
        if (child) {
          stack.push(child);
        }
      }
    }

    return null;
  },

  detectDataModel(node: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, filePath: string): DataModelSpec | null {
    // Express doesn't have native models, but we can do a file name or simple check
    if (filePath.toLowerCase().includes('model')) {
      if (node.type === 'class_declaration') {
        const className = node.childForFieldName('name')?.text || '';
        return { tableName: className.toLowerCase() };
      }
    }
    return null;
  },

  detectService(node: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, filePath: string): ServiceSpec | null {
    if (node.type === 'class_declaration') {
      const className = node.childForFieldName('name')?.text || '';
      if (className.endsWith('Service') || filePath.toLowerCase().includes('service')) {
        return { isService: true };
      }
    }
    return null;
  }
};
