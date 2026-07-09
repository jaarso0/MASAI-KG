import { describe, test, expect } from 'vitest';
import * as path from 'path';
import { parseProject } from '../src/stage1-parse/walker.js';

describe('Stage 1 - Parse', () => {
  test('Parses Python project and matches AST structure', async () => {
    const pythonProjPath = path.resolve('tests/fixtures/python-project');
    const files = await parseProject(pythonProjPath);

    expect(files.length).toBe(3);
    const mainFile = files.find(f => f.filePath === 'main.py');
    expect(mainFile).toBeDefined();
    expect(mainFile?.language).toBe('python');
    expect(mainFile?.tree.rootNode.type).toBe('module');
    expect(mainFile?.sourceCode).toContain('from services.user import');
  });

  test('Parses TypeScript project and matches AST structure', async () => {
    const tsProjPath = path.resolve('tests/fixtures/typescript-project');
    const files = await parseProject(tsProjPath);

    expect(files.length).toBe(3);
    const serviceFile = files.find(f => f.filePath === 'src/services/user.ts');
    expect(serviceFile).toBeDefined();
    expect(serviceFile?.language).toBe('typescript');
    expect(serviceFile?.tree.rootNode.type).toBe('program');
  });

  test('Parses HTML project and matches AST structure', async () => {
    const htmlProjPath = path.resolve('tests/fixtures/html-project');
    const files = await parseProject(htmlProjPath);

    expect(files.length).toBe(2);
    const htmlFile = files.find(f => f.filePath === 'index.html');
    expect(htmlFile).toBeDefined();
    expect(htmlFile?.language).toBe('html');
    expect(htmlFile?.tree.rootNode.type).toBe('document');
  });
});
