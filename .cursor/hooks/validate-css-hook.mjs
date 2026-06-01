#!/usr/bin/env node
/**
 * Cursor hook: validate CSS after agent edits and before session stop.
 * Mirrors Vite's PostCSS/Tailwind pipeline so overlay errors are caught early.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { formatErrorsForAgent, validateCssFiles } from '../../scripts/validate-css.mjs';

const ROOT = process.cwd();

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '{}';
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractCssPaths(payload) {
  const paths = new Set();

  const direct =
    payload.file_path ??
    payload.path ??
    payload.filePath ??
    payload.tool_input?.path ??
    payload.toolInput?.path ??
    payload.input?.path;

  if (typeof direct === 'string' && direct.endsWith('.css')) {
    paths.add(direct);
  }

  for (const key of ['files', 'edited_files', 'editedFiles', 'paths']) {
    for (const file of asArray(payload[key])) {
      if (typeof file === 'string' && file.endsWith('.css')) {
        paths.add(file);
      } else if (file && typeof file.path === 'string' && file.path.endsWith('.css')) {
        paths.add(file.path);
      }
    }
  }

  for (const edit of asArray(payload.edits)) {
    if (edit && typeof edit.path === 'string' && edit.path.endsWith('.css')) {
      paths.add(edit.path);
    }
  }

  // StrReplace / Write always touch index.css in this repo's liquid workstream.
  if (paths.size === 0) {
    const toolName = payload.tool_name ?? payload.toolName ?? '';
    const haystack = JSON.stringify(payload);
    if (
      toolName === 'Write' ||
      toolName === 'StrReplace' ||
      haystack.includes('src/index.css') ||
      haystack.includes('index.css')
    ) {
      paths.add('src/index.css');
    }
  }

  return [...paths];
}

function respond(body) {
  process.stdout.write(`${JSON.stringify(body)}\n`);
}

async function main() {
  const mode = process.argv[2] ?? process.env.CURSOR_HOOK_EVENT ?? 'post';
  let payload = {};

  try {
    payload = JSON.parse(readStdin() || '{}');
  } catch {
    payload = {};
  }

  const cssPaths = extractCssPaths(payload);
  const targets = cssPaths.length > 0 ? cssPaths : ['src/index.css'];
  const errors = await validateCssFiles(targets);

  if (errors.length === 0) {
    respond({});
    return;
  }

  const message = formatErrorsForAgent(errors);

  if (mode === 'stop' || mode === 'subagentStop') {
    respond({
      followup_message: `${message}\n\nAuto-fix the CSS syntax error(s) above, then run \`npm run validate:css\` to confirm before finishing.`,
    });
    return;
  }

  respond({
    additional_context: message,
  });
}

main().catch((error) => {
  respond({
    additional_context: `CSS validation hook failed: ${error.message ?? error}. Run \`npm run validate:css\` manually.`,
  });
});
