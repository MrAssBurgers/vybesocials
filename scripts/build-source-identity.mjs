import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

export const SOURCE_SCHEMA = 'vybe-client-source-v1';
const generated = new Set(['public/version.json', 'public/despia/local.json', 'public/boot-theme.js']);
const ignoredDirectories = new Set(['node_modules', 'dist', 'dist-ssr', 'work', 'bin', 'obj']);
const textExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.html', '.svg', '.md', '.yml', '.yaml', '.txt', '.sh', '.ps1', '.bat', '.lock']);
const extensionlessText = new Set(['public/_headers', 'public/.well-known/apple-app-site-association']);

/** Identify client inputs independently of Git or generated build metadata. */
export function clientSourceIdentity(root) {
  for (const name of ['src', 'package.json', 'index.html', 'vite.config.ts']) {
    if (!existsSync(join(root, name))) throw new Error(`Missing client source input: ${name}`);
  }
  const files = [];
  const walk = relative => {
    if (lstatSync(join(root, relative)).isSymbolicLink()) throw new Error(`Symlink is not a supported build input: ${relative}`);
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      if ((entry.name.startsWith('.') && !(relative === 'public' && entry.name === '.well-known')) || entry.name.endsWith('.local') || ignoredDirectories.has(entry.name)) continue;
      const name = `${relative}/${entry.name}`;
      if (generated.has(name)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Symlink is not a supported build input: ${name}`);
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) files.push(name);
    }
  };
  for (const directory of ['src', 'public', 'scripts']) if (existsSync(join(root, directory))) walk(directory);
  for (const name of readdirSync(root)) {
    if (/^(package(?:-lock)?\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|index\.html|vite\.config\.[cm]?[jt]s|tsconfig(?:\.[\w-]+)?\.json|tailwind\.config\.[cm]?[jt]s|postcss\.config\.[cm]?[jt]s|components\.json)$/.test(name)) {
      if (lstatSync(join(root, name)).isSymbolicLink()) throw new Error(`Symlink is not a supported build input: ${name}`);
      files.push(name);
    }
  }
  const hash = createHash('sha256').update(`${SOURCE_SCHEMA}\n`);
  for (const name of files.sort()) {
    let bytes = readFileSync(join(root, name));
    // Git checkouts and source archives can use different newline conventions.
    // Binary assets retain their exact bytes; no environment file is admitted.
    if (textExtensions.has(extname(name)) || extensionlessText.has(name)) bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    hash.update(`${Buffer.byteLength(name)}:${name}:${bytes.length}:`).update(bytes);
  }
  return { source_schema: SOURCE_SCHEMA, source_sha256: hash.digest('hex'), source_files: files.length };
}
