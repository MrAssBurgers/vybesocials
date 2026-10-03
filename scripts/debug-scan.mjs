#!/usr/bin/env node
/**
 * Full VYBE debug scan — run when user says "do a debug".
 * Usage: npm run debug
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function envValue(name) {
  for (const f of ['.env', '.env.local']) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(new RegExp(`${name}=(.+)`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const FIREBASE_PROJECT_ID = envValue('VITE_FIREBASE_PROJECT_ID') || 'vybe-daaab';
const FUNCTIONS_REGION = envValue('VITE_FIREBASE_FUNCTIONS_REGION') || 'us-central1';
const FUNCTIONS_BASE = `https://${FUNCTIONS_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net`;

export function run(cmd, args, opts = {}) {
  // Windows cannot spawn npm.ps1/.cmd as a native executable. Execute npm's
  // JS entry point with Node, keeping argument boundaries and avoiding a shell.
  if (process.platform === 'win32' && cmd === 'npm') {
    const npmCli = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')]
      .find(candidate => candidate && /npm-cli\.js$/i.test(candidate) && existsSync(candidate));
    if (npmCli) {
      cmd = process.execPath;
      args = [npmCli, ...args];
    }
  }
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') + (r.error ? `\n${r.error.message}` : ''), code: r.status ?? 1 };
}

/** Scan source syntax only: importing backend code would initialize live services. */
export function scanCallableReferences(scanRoot = root) {
  const parse = file => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const localFns = new Set();
  const stubFns = new Set();
  const visited = new Set();
  function exportedNames(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = parse(file);
    for (const statement of source.statements) {
      if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          for (const entry of statement.exportClause.elements) if (!entry.isTypeOnly) localFns.add(entry.name.text);
        } else if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
          const target = resolve(dirname(file), statement.moduleSpecifier.text.replace(/\.js$/, '.ts'));
          if (existsSync(target)) exportedNames(target);
        }
      }
      if (!statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          localFns.add(declaration.name.text);
          if (declaration.initializer && ts.isCallExpression(declaration.initializer) && declaration.initializer.expression.getText(source) === 'pending') stubFns.add(declaration.name.text);
        }
      } else if (ts.isFunctionDeclaration(statement) && statement.name) localFns.add(statement.name.text);
    }
  }
  exportedNames(join(scanRoot, 'functions/src/index.ts'));
  const overrides = new Map();
  const mapping = parse(join(scanRoot, 'src/lib/firebase/functionsService.ts'));
  for (const statement of mapping.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'OVERRIDES' || !declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
      for (const property of declaration.initializer.properties) {
        if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && ts.isStringLiteral(property.initializer)) overrides.set(property.name.text, property.initializer.text);
      }
    }
  }
  const references = [];
  const unresolved = [];
  const localRpcNames = new Set();
  for (const [file, variable] of [
    ['src/lib/firebase/dataClient.ts', 'CLIENT_RPC'],
    ['src/lib/firebase/feedRpc.ts', 'FEED_RPC_NAMES'],
    ['src/lib/firebase/socialRpc.ts', 'SOCIAL_RPC_NAMES'],
  ]) {
    const source = parse(join(scanRoot, file));
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== variable || !declaration.initializer) continue;
        if (ts.isObjectLiteralExpression(declaration.initializer)) {
          for (const property of declaration.initializer.properties) if (property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) localRpcNames.add(property.name.text);
        } else if (ts.isNewExpression(declaration.initializer)) {
          for (const argument of declaration.initializer.arguments || []) {
            if (ts.isArrayLiteralExpression(argument)) for (const item of argument.elements) if (ts.isStringLiteral(item)) localRpcNames.add(item.text);
          }
        }
      }
    }
  }
  function scanDirectory(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) { scanDirectory(file); continue; }
      if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\./.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
      const source = parse(file);
      const declarations = new Map();
      const callableNames = new Set(['httpsCallable']);
      const invokeNames = new Set(['invokeFunction', 'invokeEdgeFeature']);
      const urlNames = new Set(['getFunctionUrl', 'getEdgeFunctionUrl']);
      function collect(node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
          const previous = declarations.get(node.name.text);
          const initializer = node.initializer || (ts.isVariableDeclarationList(node.parent) && ts.isForOfStatement(node.parent.parent) ? node.parent.parent.expression : undefined);
          declarations.set(node.name.text, previous === undefined ? initializer : null);
        }
        if (ts.isImportSpecifier(node)) {
          const imported = (node.propertyName || node.name).text;
          if (imported === 'httpsCallable') callableNames.add(node.name.text);
          if (['invokeFunction', 'invokeEdgeFeature'].includes(imported)) invokeNames.add(node.name.text);
          if (['getFunctionUrl', 'getEdgeFunctionUrl'].includes(imported)) urlNames.add(node.name.text);
        }
        if (ts.isFunctionDeclaration(node) && node.name && node.parameters[0] && ts.isIdentifier(node.parameters[0].name) && node.body) {
          const parameterName = node.parameters[0].name.text;
          const findForwarder = child => {
            if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && invokeNames.has(child.expression.text) && child.arguments[0] && ts.isIdentifier(child.arguments[0]) && child.arguments[0].text === parameterName) invokeNames.add(node.name.text);
            ts.forEachChild(child, findForwarder);
          };
          findForwarder(node.body);
        }
        ts.forEachChild(node, collect);
      }
      collect(source);
      function namesFor(node, seen = new Set()) {
        if (!node) return [];
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
        if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(item => namesFor(item, seen));
        if (ts.isConditionalExpression(node)) return [...namesFor(node.whenTrue, seen), ...namesFor(node.whenFalse, seen)];
        if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return namesFor(node.expression, seen);
        if (ts.isIdentifier(node) && !seen.has(node.text)) return namesFor(declarations.get(node.text), new Set([...seen, node.text]));
        return [];
      }
      function visit(node) {
        if (ts.isCallExpression(node) && node.arguments.length) {
          const expression = node.expression;
          const direct = ts.isIdentifier(expression) && callableNames.has(expression.text);
          const http = ts.isIdentifier(expression) && urlNames.has(expression.text);
          const rpc = ts.isPropertyAccessExpression(expression) && expression.name.text === 'rpc';
          const sdkCall = relative(scanRoot, file).replaceAll('\\', '/').startsWith('sdk/game/') && ts.isPropertyAccessExpression(expression) && expression.name.text === 'call';
          const invoke = (ts.isIdentifier(expression) && invokeNames.has(expression.text))
            || (ts.isPropertyAccessExpression(expression) && expression.name.text === 'invoke' && /(?:^|\.)functions$/.test(expression.expression.getText(source)));
          if (direct || http || invoke || rpc || sdkCall) {
            const argument = node.arguments[direct ? 1 : 0];
            const names = namesFor(argument);
            const location = `${relative(scanRoot, file).replaceAll('\\', '/')}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
            if (!names.length) unresolved.push(location);
            for (const name of names) {
              if (rpc && localRpcNames.has(name)) continue;
              const exportedName = invoke || rpc ? overrides.get(name) ?? name.replace(/[-_]([a-z0-9])/g, (_, character) => character.toUpperCase()) : name;
              references.push({ name, exportedName, location, transport: rpc ? 'rpc-fallback' : http ? 'http' : 'callable' });
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scanDirectory(join(scanRoot, 'src'));
  if (existsSync(join(scanRoot, 'sdk/game'))) scanDirectory(join(scanRoot, 'sdk/game'));
  return {
    referenceCount: references.length,
    clientNames: [...new Set(references.map(reference => reference.name))].sort(),
    exportedNames: [...localFns].sort(),
    aliases: Object.fromEntries(overrides),
    missing: references.filter(reference => !localFns.has(reference.exportedName)),
    stubs: [...new Set(references.filter(reference => stubFns.has(reference.exportedName)).map(reference => reference.exportedName))].sort(),
    unresolved: [...new Set(unresolved)].sort(),
  };
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function probe(url, opts = {}) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
    const text = await res.text().catch(() => '');
    return { status: res.status, ok: res.ok, text: text.slice(0, 240) };
  } catch (e) {
    return { status: 0, ok: false, error: String(e) };
  }
}

/** Empty unauthenticated request; require a Firebase error, not a generic gateway 403. */
export async function probeCallable(label, url) {
  const r = await probe(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: {} }),
  });
  let errorStatus;
  try { errorStatus = JSON.parse(r.text || '{}').error?.status; } catch { /* Non-callable response. */ }
  const gated = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'INVALID_ARGUMENT'].includes(errorStatus);
  return { label, ...r, pass: gated, detail: errorStatus || 'callable gate not verified' };
}

/** Public HTTP function — health probe or expected validation response. */
export async function probeHttp(label, url, { healthQuery = '?probe=1' } = {}) {
  const health = await probe(`${url}${healthQuery}`);
  let healthData;
  try { healthData = JSON.parse(health.text || '{}'); } catch { /* Not a health payload. */ }
  if (health.status === 200 && healthData?.ok === true && healthData?.fn === label) {
    return { label, ...health, pass: true, detail: 'health ok' };
  }
  const bare = await probe(url, { method: 'GET' });
  const deployed = (bare.status === 400 && bare.text?.trim() === 'postId required')
    || (bare.status === 404 && bare.text?.trim() === 'not found');
  return { label, ...bare, pass: deployed, detail: deployed ? 'http handler' : 'not deployed' };
}

async function main() {
  console.log('VYBE debug scan (Firebase)');
  console.log(`Project: ${FIREBASE_PROJECT_ID}`);
  console.log(`Time: ${new Date().toISOString()}`);

  section('Frontend — build');
  const build = run('npm', ['run', 'build'], { stdio: 'pipe' });
  console.log(build.ok ? 'PASS npm run build' : `FAIL npm run build (exit ${build.code})`);
  if (!build.ok) console.log(build.out.slice(-800));

  section('Frontend — lint');
  const lint = run('npm', ['run', 'lint'], { stdio: 'pipe' });
  console.log(lint.ok ? 'PASS npm run lint' : `FAIL npm run lint (exit ${lint.code})`);

  section('Frontend — CSS');
  const css = run('npm', ['run', 'validate:css'], { stdio: 'pipe' });
  console.log(css.ok ? 'PASS npm run validate:css' : 'WARN validate:css');

  section('Frontend — boot entry');
  const boot = run('npm', ['run', 'validate:boot'], { stdio: 'pipe' });
  console.log(boot.ok ? 'PASS npm run validate:boot' : `FAIL npm run validate:boot (exit ${boot.code})`);
  if (!boot.ok) console.log(boot.out.trim());

  section('Cloud Functions — local vs client references');
  const references = scanCallableReferences();
  console.log(`Client references ${references.clientNames.length} function names at ${references.referenceCount} sites; ${references.exportedNames.length} names exported through functions/src/index.ts`);
  if (references.missing.length) {
    for (const missing of references.missing) console.log(`WARN missing export ${missing.exportedName} (${missing.name}) at ${missing.location}`);
  } else console.log('OK — statically resolved client references have local exports');
  if (references.stubs.length) console.log(`WARN client-referenced pending implementations: ${references.stubs.join(', ')}`);
  if (references.unresolved.length) console.log(`REVIEW dynamic callable targets: ${references.unresolved.join(', ')}`);

  section('Production probes (Firebase)');
  const callableProbes = [
    ['livekitToken', `${FUNCTIONS_BASE}/livekitToken`],
    ['aiCatchUp', `${FUNCTIONS_BASE}/aiCatchUp`],
  ];
  const httpProbes = [['sharePreview', `${FUNCTIONS_BASE}/sharePreview`]];

  for (const [label, url] of httpProbes) {
    const r = await probeHttp(label, url);
    const status = r.status || r.error || 'ERR';
    const suffix = r.detail ? ` (${r.detail})` : '';
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${label}: HTTP ${status}${suffix}`);
  }
  for (const [label, url] of callableProbes) {
    const r = await probeCallable(label, url);
    const status = r.status || r.error || 'ERR';
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${label} (callable): HTTP ${status} (${r.detail})`);
  }

  section('Git status');
  const git = run('git', ['status', '--short'], { stdio: 'pipe' });
  console.log(git.out.trim() || '(clean)');

  console.log('\n=== Summary ===');
  console.log('- Backend: Firebase (Firestore + Cloud Functions + Auth)');
  console.log('- Deploy only the reviewed Firebase changes; a passing probe is not deployment authorization.');
  console.log('- Web prod: Lovable → Share → Publish for vybehub.app');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
