import Parser from 'tree-sitter';
import { FrameworkAdapter, EndpointSpec, DataModelSpec, ServiceSpec } from './types.js';

export const NestJSAdapter: FrameworkAdapter = {
  name: 'nestjs',

  detectEndpoint(node: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, filePath: string): EndpointSpec | null {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx') && !filePath.endsWith('.js') && !filePath.endsWith('.jsx')) return null;
    if (node.type !== 'method_definition') return null;

    // Search for routing decorators on the method node itself
    // In tree-sitter-typescript, decorators are often children of the method_definition, or preceding siblings.
    // Let's look for any 'decorator' node in the method's children or its parent/siblings (just to be safe).
    let methodDecorators: Parser.SyntaxNode[] = [];
    
    // Look at method's direct children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === 'decorator') {
        methodDecorators.push(child);
      }
    }

    // Look at preceding siblings of the method in its parent (sometimes tree-sitter puts decorators as siblings)
    if (node.parent) {
      const idx = node.parent.children.indexOf(node);
      if (idx > 0) {
        for (let i = idx - 1; i >= 0; i--) {
          const sibling = node.parent.children[i];
          if (sibling.type === 'decorator') {
            methodDecorators.push(sibling);
          } else if (sibling.type !== 'comment') {
            // Stop if we hit a non-decorator, non-comment sibling to prevent going too far back
            break;
          }
        }
      }
    }

    for (const dec of methodDecorators) {
      const text = dec.text;
      const match = text.match(/@(Get|Post|Put|Delete|Patch|Options|Head)\(\s*(['"]?)(.*?)\2\s*\)/i);
      if (match) {
        const method = match[1].toUpperCase();
        let path = match[3] || '';

        // Find class-level @Controller prefix
        let controllerPrefix = '';
        let classNode: Parser.SyntaxNode | null = node.parent;
        while (classNode && classNode.type !== 'class_declaration') {
          classNode = classNode.parent;
        }

        if (classNode) {
          // Find @Controller decorator on class
          const classDecorators: Parser.SyntaxNode[] = [];
          for (let i = 0; i < classNode.childCount; i++) {
            const child = classNode.child(i);
            if (child && child.type === 'decorator') {
              classDecorators.push(child);
            }
          }
          // Also check preceding siblings for class
          if (classNode.parent) {
            const cIdx = classNode.parent.children.indexOf(classNode);
            if (cIdx > 0) {
              for (let i = cIdx - 1; i >= 0; i--) {
                const sibling = classNode.parent.children[i];
                if (sibling.type === 'decorator') {
                  classDecorators.push(sibling);
                } else if (sibling.type !== 'comment') {
                  break;
                }
              }
            }
          }

          for (const cDec of classDecorators) {
            const cText = cDec.text;
            const cMatch = cText.match(/@Controller\(\s*(['"]?)(.*?)\1\s*\)/);
            if (cMatch) {
              controllerPrefix = cMatch[2] || '';
              break;
            }
          }
        }

        // Clean and join paths
        let finalPath = '';
        if (controllerPrefix) {
          finalPath += '/' + controllerPrefix.replace(/^\/|\/$/g, '');
        }
        if (path) {
          finalPath += '/' + path.replace(/^\/|\/$/g, '');
        }
        if (!finalPath) {
          finalPath = '/';
        }
        // Deduplicate slashes
        finalPath = finalPath.replace(/\/+/g, '/');

        return { path: finalPath, method };
      }
    }

    return null;
  },

  detectDataModel(node: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, filePath: string): DataModelSpec | null {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx') && !filePath.endsWith('.js') && !filePath.endsWith('.jsx')) return null;
    if (node.type !== 'class_declaration') return null;

    // Check for @Entity or @Table decorator
    let isEntity = false;
    let tableName = '';

    const decorators: Parser.SyntaxNode[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === 'decorator') {
        decorators.push(child);
      }
    }
    if (node.parent) {
      const idx = node.parent.children.indexOf(node);
      if (idx > 0) {
        for (let i = idx - 1; i >= 0; i--) {
          const sibling = node.parent.children[i];
          if (sibling.type === 'decorator') {
            decorators.push(sibling);
          } else if (sibling.type !== 'comment') {
            break;
          }
        }
      }
    }

    for (const dec of decorators) {
      const text = dec.text;
      const entityMatch = text.match(/@(Entity|Table)\(\s*(['"]?)(.*?)\2\s*\)/);
      if (entityMatch) {
        isEntity = true;
        const arg = entityMatch[3];
        // If arg contains an object like name: 'users', we could parse it, or check if it matches simple patterns
        if (arg) {
          const namePropMatch = arg.match(/name\s*:\s*(['"])(.*?)\1/);
          tableName = namePropMatch ? namePropMatch[2] : arg.replace(/^['"]|['"]$/g, '');
        }
        break;
      } else if (text.startsWith('@Entity') || text.startsWith('@Table')) {
        isEntity = true;
        break;
      }
    }

    if (isEntity) {
      const className = node.childForFieldName('name')?.text || '';
      return { tableName: tableName || className.toLowerCase() };
    }

    return null;
  },

  detectService(node: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, filePath: string): ServiceSpec | null {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx') && !filePath.endsWith('.js') && !filePath.endsWith('.jsx')) return null;
    if (node.type !== 'class_declaration') return null;

    const className = node.childForFieldName('name')?.text || '';
    let hasInjectable = false;

    const decorators: Parser.SyntaxNode[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === 'decorator') {
        decorators.push(child);
      }
    }
    if (node.parent) {
      const idx = node.parent.children.indexOf(node);
      if (idx > 0) {
        for (let i = idx - 1; i >= 0; i--) {
          const sibling = node.parent.children[i];
          if (sibling.type === 'decorator') {
            decorators.push(sibling);
          } else if (sibling.type !== 'comment') {
            break;
          }
        }
      }
    }

    for (const dec of decorators) {
      if (dec.text.includes('@Injectable')) {
        hasInjectable = true;
        break;
      }
    }

    const isService = hasInjectable || className.endsWith('Service') || filePath.toLowerCase().includes('service');

    return isService ? { isService: true } : null;
  }
};
