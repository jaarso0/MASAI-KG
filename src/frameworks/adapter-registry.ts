import Parser from 'tree-sitter';
import { FastAPIAdapter } from './fastapi.js';
import { FlaskAdapter } from './flask.js';
import { NestJSAdapter } from './nestjs.js';
import { ExpressAdapter } from './express.js';
import { EndpointSpec, DataModelSpec } from './types.js';

const adapters = [FastAPIAdapter, FlaskAdapter, NestJSAdapter, ExpressAdapter];

export interface RegistryResult {
  apiRoute?: EndpointSpec;
  dataModel?: DataModelSpec;
  isService?: boolean;
}

export function runAdapters(
  node: Parser.SyntaxNode,
  rootNode: Parser.SyntaxNode,
  filePath: string
): RegistryResult {
  const result: RegistryResult = {};

  for (const adapter of adapters) {
    try {
      const endpoint = adapter.detectEndpoint(node, rootNode, filePath);
      if (endpoint) {
        result.apiRoute = endpoint;
      }
    } catch (e) {
      // Silently catch adapter errors to avoid crashing normalizer
    }

    try {
      const dataModel = adapter.detectDataModel(node, rootNode, filePath);
      if (dataModel) {
        result.dataModel = dataModel;
      }
    } catch (e) {
      // Silently catch adapter errors
    }

    try {
      const service = adapter.detectService(node, rootNode, filePath);
      if (service && service.isService) {
        result.isService = true;
      }
    } catch (e) {
      // Silently catch adapter errors
    }
  }

  return result;
}
