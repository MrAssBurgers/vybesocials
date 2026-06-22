import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src/_shared/emailTemplates');
const destDir = join(root, 'lib/_shared/emailTemplates');

mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const file of readdirSync(srcDir)) {
  if (!file.endsWith('.html')) continue;
  cpSync(join(srcDir, file), join(destDir, file));
  copied += 1;
}

console.log(`[copy-static-assets] Copied ${copied} email template(s) to lib/`);
