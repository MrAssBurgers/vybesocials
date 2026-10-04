import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Check source assets before bundling: browsers may sniff mismatched images,
// while uploads, notification hosts and native integrations reject them.
const root = fileURLToPath(new URL('../', import.meta.url));
const supported = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico']);
let checked = 0;
const failures = [];
function format(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return '.jpg';
  if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return '.gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (bytes.length >= 6 && bytes.readUInt32LE(0) === 65536 && bytes.readUInt16LE(4) > 0) return '.ico';
  return 'unrecognized';
}
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (entry.isFile() && supported.has(extname(path).toLowerCase())) {
      const expected = extname(path).toLowerCase().replace('.jpeg', '.jpg');
      const actual = format(await readFile(path));
      checked++;
      if (actual !== expected) failures.push(`${relative(root, path)}: expected ${expected}, found ${actual}`);
    }
  }
}
for (const directory of ['public', 'src/assets', 'assets']) await scan(join(root, directory));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`Image format signatures match all ${checked} source assets.`);
