import * as fs from 'fs';
import * as path from 'path';
import { validate } from '../validator';
import { lintContent } from '../validator/mush-lint';
import { compatibilityReport } from '../validator';
import { OfflineExpect } from './expect';
import type { OfflineDocument, OfflineAttr } from './types';

export { compatibilityReport };

function extractAttrs(source: string): OfflineAttr[] {
  const attrs: OfflineAttr[] = [];
  const lines = source.split('\n');
  let current: { name: string; object: string; value: string; line: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const m = trimmed.match(/^&([A-Za-z_][A-Za-z0-9_.:@-]*)\s+([^=\s][^=]*)=(.*)$/);
    if (m) {
      if (current) attrs.push({ ...current, value: current.value.trim() });
      current = { name: m[1].toUpperCase(), object: m[2].trim(), value: m[3], line: i + 1 };
      continue;
    }
    if (current && raw.match(/^\s+\S/) && !trimmed.startsWith('&') && !trimmed.startsWith('@') && !trimmed.startsWith('//')) {
      current.value += ' ' + trimmed;
      continue;
    }
    if (current) {
      attrs.push({ ...current, value: current.value.trim() });
      current = null;
    }
  }
  if (current) attrs.push({ ...current, value: current.value.trim() });
  return attrs;
}

export function parseDocument(source: string, filename = '<inline>'): OfflineDocument {
  const attrs = extractAttrs(source);
  const validationResult = validate(source);
  const lintResult = lintContent(source, filename);
  const doc = { source, filename, attrs, validationResult, lintResult } as OfflineDocument;
  Object.defineProperty(doc, 'expect', { get: () => new OfflineExpect(doc), enumerable: false });
  return doc;
}

export function parseDocumentFile(filePath: string): OfflineDocument {
  const source = fs.readFileSync(filePath, 'utf-8');
  return parseDocument(source, path.resolve(filePath));
}

const MUSH_EXTENSIONS = new Set(['.mush', '.txt', '.installer']);

function walkDir(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, out);
    } else if (MUSH_EXTENSIONS.has(path.extname(entry.name)) || entry.name.endsWith('.installer.txt')) {
      out.push(full);
    }
  }
}

export function loadFiles(filePaths: string[]): OfflineDocument[] {
  return filePaths.map(parseDocumentFile);
}

export function loadGlob(pattern: string, cwd = process.cwd()): OfflineDocument[] {
  const resolved = path.resolve(cwd, pattern);
  const paths: string[] = [];

  try {
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      walkDir(resolved, paths);
    } else {
      paths.push(resolved);
    }
  } catch {
    // Pattern may be a glob-style path — do best-effort directory prefix walk
    const parts = pattern.split('/');
    const base = parts.slice(0, parts.findIndex(p => p.includes('*') || p.includes('?'))).join('/');
    const baseDir = path.resolve(cwd, base || '.');
    if (fs.existsSync(baseDir)) walkDir(baseDir, paths);
  }

  return paths.map(parseDocumentFile);
}
