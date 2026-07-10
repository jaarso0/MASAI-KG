export type Language = 'typescript' | 'tsx' | 'javascript' | 'jsx' | 'python' | 'java' | 'html';

export const EXTENSION_MAP: Record<string, Language> = {
  '.ts':  'typescript',
  '.tsx': 'tsx',
  '.js':  'javascript',
  '.jsx': 'jsx',
  '.py':  'python',
  '.java': 'java',
  '.html': 'html',
};

export function detectLanguage(filePath: string): Language | null {
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return EXTENSION_MAP[extension] || null;
}
