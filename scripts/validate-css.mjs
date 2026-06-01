#!/usr/bin/env node
/**
 * Validates CSS through the same PostCSS + Tailwind pipeline Vite uses.
 * Usage: node scripts/validate-css.mjs [file...]
 */
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const ROOT = process.cwd();
const DEFAULT_TARGETS = ['src/index.css'];

function collectCssFiles(args) {
  if (args.length > 0) {
    return args
      .map((file) => path.resolve(ROOT, file))
      .filter((file) => file.endsWith('.css') && fs.existsSync(file));
  }

  return DEFAULT_TARGETS.map((file) => path.resolve(ROOT, file)).filter((file) => fs.existsSync(file));
}

export async function validateCssFile(file) {
  const css = fs.readFileSync(file, 'utf8');
  await postcss([tailwindcss, autoprefixer]).process(css, { from: file });
}

export async function validateCssFiles(files) {
  const errors = [];

  for (const file of files) {
    try {
      await validateCssFile(file);
    } catch (error) {
      const relative = path.relative(ROOT, file) || file;
      errors.push({
        file: relative,
        line: error.line ?? null,
        column: error.column ?? null,
        reason: error.reason ?? error.message ?? 'Unknown CSS parse error',
      });
    }
  }

  return errors;
}

function formatError(error) {
  const location =
    error.line != null
      ? `line ${error.line}${error.column != null ? `, column ${error.column}` : ''}`
      : 'unknown location';

  return `${error.file} (${location}): ${error.reason}`;
}

export function formatErrorsForAgent(errors) {
  if (errors.length === 0) return '';

  const details = errors.map(formatError).join('\n');
  return [
    'Vite/PostCSS CSS parse error detected (same pipeline as the dev-server overlay).',
    'Fix the syntax error immediately — common causes: missing `{` after a selector list, extra/missing `}`, or a broken comma-separated selector block.',
    '',
    details,
  ].join('\n');
}

async function main() {
  const files = collectCssFiles(process.argv.slice(2));
  if (files.length === 0) {
    console.error('No CSS files found to validate.');
    process.exit(1);
  }

  const errors = await validateCssFiles(files.map((file) => path.relative(ROOT, file)));

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`CSS_PARSE_ERROR|${formatError(error)}`);
    }
    process.exit(1);
  }

  console.log(`CSS OK (${files.map((f) => path.relative(ROOT, f)).join(', ')})`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
