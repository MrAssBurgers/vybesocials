import { MINI_APP_CATEGORIES, MINI_APP_CODE_LIMIT, type MiniAppSource } from './model';

export const MINI_APP_FILE_BYTES = 1_000_000;
const fields = ['title', 'description', 'category', 'html', 'css', 'javascript'];
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}
function source(value: unknown): MiniAppSource {
  if (!exact(value, fields) || fields.some(key => typeof value[key] !== 'string')
    || (value.title as string).length > 60 || (value.description as string).length > 240
    || !MINI_APP_CATEGORIES.includes(value.category as MiniAppSource['category'])
    || (value.html as string).length + (value.css as string).length + (value.javascript as string).length > MINI_APP_CODE_LIMIT) {
    throw new Error('This file does not contain a supported mini-app draft within the 100,000-character code limit.');
  }
  // Preserve unfinished drafts and whitespace exactly; saving/publishing validates them separately.
  return Object.fromEntries(fields.map(key => [key, value[key]])) as unknown as MiniAppSource;
}
export function serializeMiniAppFile(value: MiniAppSource): string {
  return JSON.stringify({ format: 'vybe-mini-app', version: 1, source: source(Object.fromEntries(fields.map(key => [key, value[key]]))) }, null, 2) + '\n';
}
export function parseMiniAppFile(text: string): MiniAppSource {
  if (text.length > MINI_APP_FILE_BYTES || new TextEncoder().encode(text).byteLength > MINI_APP_FILE_BYTES) throw new Error('Choose a mini-app file smaller than 1 MB.');
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Choose a valid Vybe mini-app JSON file.'); }
  if (!exact(value, ['format', 'version', 'source']) || value.format !== 'vybe-mini-app' || value.version !== 1) {
    throw new Error('This file uses an unsupported mini-app format or version.');
  }
  return source(value.source);
}
export async function readMiniAppFile(file: File): Promise<MiniAppSource> {
  if (file.size > MINI_APP_FILE_BYTES) throw new Error('Choose a mini-app file smaller than 1 MB.');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MINI_APP_FILE_BYTES) throw new Error('Choose a mini-app file smaller than 1 MB.');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Save this mini-app file as UTF-8 JSON and try again.'); }
  return parseMiniAppFile(text);
}
export function downloadMiniAppFile(value: MiniAppSource): void {
  const text = serializeMiniAppFile(value);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  const name = value.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'draft';
  anchor.href = url; anchor.download = `vybe-${name}.json`; anchor.hidden = true;
  try { document.body.append(anchor); anchor.click(); }
  finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
