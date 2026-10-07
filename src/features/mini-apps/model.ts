export const MINI_APP_CODE_LIMIT = 100_000;
export const MINI_APP_CATEGORIES = ['game', 'tool', 'art'] as const;
export type MiniAppCategory = typeof MINI_APP_CATEGORIES[number];

export interface MiniAppSource {
  title: string;
  description: string;
  category: MiniAppCategory;
  html: string;
  css: string;
  javascript: string;
}

export interface MiniAppRecord extends MiniAppSource {
  id: string;
  owner_id: string;
  schema_version: 1;
  status?: 'published';
  publication_revision?: string;
  created_at?: unknown;
  updated_at?: unknown;
}

export function validateMiniApp(input: unknown): MiniAppSource {
  if (!input || typeof input !== 'object') throw new Error('Choose a mini app first.');
  const value = input as Record<string, unknown>;
  for (const field of ['title', 'description', 'html', 'css', 'javascript']) {
    if (typeof value[field] !== 'string') throw new Error(`The ${field} field must be text.`);
  }
  const title = (value.title as string).trim();
  const description = (value.description as string).trim();
  if (!title || title.length > 60) throw new Error('Give your app a name between 1 and 60 characters.');
  if (description.length > 240) throw new Error('Keep the description under 241 characters.');
  if (!MINI_APP_CATEGORIES.includes(value.category as MiniAppCategory)) throw new Error('Choose a valid category.');
  const { html, css, javascript } = value as unknown as MiniAppSource;
  if (!(html.trim() || javascript.trim())) throw new Error('Add some HTML or JavaScript to your app.');
  if (html.length + css.length + javascript.length > MINI_APP_CODE_LIMIT) {
    throw new Error('Your app is too large. Keep the combined code under 100,001 characters.');
  }
  return { title, description, category: value.category as MiniAppCategory, html, css, javascript };
}

export function miniAppError(error: unknown, operation?: 'publish'): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code).replace(/^functions\//, '') : '';
  const message = error instanceof Error ? error.message.replace(/\s\[\d{3}\]$/, '') : '';
  const bareInternal = code === 'internal' || /^internal$/i.test(message.trim());
  const missing = code === 'not-found' || code === 'unimplemented' || code === 'not_yet_ported';
  if (operation === 'publish' && (bareInternal || missing)) return 'Publishing is not available right now. Your private draft is still saved. Try again in a moment.';
  if (bareInternal || missing) return 'Mini apps could not be reached. Try again in a moment.';
  if (operation === 'publish' && code.includes('permission-denied')) return 'Publishing is blocked for this app. A moderation hold or account permissions may need review. You can keep saving and previewing your private draft.';
  if (code.includes('permission-denied')) return 'Mini apps are not available for your account right now. You can still edit and preview your code locally.';
  if (code.includes('unavailable')) return 'You appear to be offline. Keep this page open and try again when connected.';
  return message || 'Something went wrong. Please try again.';
}
