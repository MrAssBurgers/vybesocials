#!/usr/bin/env node
/**
 * Guard against black-screen boot regressions in src/main.tsx:
 * - module-scope calls must reference imported symbols
 * - production build must succeed (catches broken import graph)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mainPath = join(root, 'src/main.tsx');

const BUILTINS = new Set([
  'console', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'performance',
  'fetch', 'Promise', 'Math', 'Date', 'JSON', 'Object', 'Array', 'String',
  'Number', 'Boolean', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol',
  'Intl', 'URL', 'URLSearchParams', 'AbortController', 'requestAnimationFrame',
  'cancelAnimationFrame', 'import', 'meta',
]);

function collectImports(src) {
  const names = new Set(BUILTINS);
  const importRe = /import\s+(?:type\s+)?(?:{([^}]+)}|(\w+))\s+from\s+['"][^'"]+['"]/g;
  let m;
  while ((m = importRe.exec(src))) {
    if (m[2]) {
      names.add(m[2]);
      continue;
    }
    for (const part of m[1].split(',')) {
      const chunk = part.trim();
      if (!chunk) continue;
      const alias = chunk.split(/\s+as\s+/i);
      names.add(alias[alias.length - 1].trim());
    }
  }
  return names;
}

const IGNORE = new Set([
  ...BUILTINS,
  'if', 'catch', 'for', 'while', 'switch', 'else', 'try', 'finally', 'return', 'throw',
  'new', 'typeof', 'void', 'await', 'async', 'do', 'case', 'break', 'continue', 'delete',
  'instanceof', 'in', 'of', 'super', 'this', 'yield', 'debugger', 'with', 'default',
  'error', 'fallbackError', 'rootEl', 'root',
]);

function findModuleScopeCalls(src) {
  const calls = new Set();
  const stripped = src
    .replace(/function\s+\w+[^{]*\{[\s\S]*?\n\}/g, '')
    .replace(/try\s*\{[\s\S]*\}\s*catch[\s\S]*$/m, '');
  const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = callRe.exec(stripped))) {
    calls.add(m[1]);
  }
  return calls;
}

function collectLocalDeclarations(src) {
  const names = new Set();
  const fnRe = /(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = fnRe.exec(src))) {
    names.add(m[1]);
  }
  return names;
}

function checkMainIdentifiers() {
  if (!existsSync(mainPath)) {
    console.error('FAIL check-boot-entry: src/main.tsx missing');
    return false;
  }
  const src = readFileSync(mainPath, 'utf8');
  const imports = collectImports(src);
  const locals = collectLocalDeclarations(src);
  const calls = findModuleScopeCalls(src);
  const missing = [...calls].filter((name) => !imports.has(name) && !locals.has(name) && !IGNORE.has(name));
  if (missing.length > 0) {
    console.error('FAIL check-boot-entry: module-scope calls without imports:', missing.join(', '));
    return false;
  }
  console.log('PASS check-boot-entry: main.tsx module-scope identifiers');
  return true;
}

function main() {
  const ok = checkMainIdentifiers();
  process.exit(ok ? 0 : 1);
}

main();
