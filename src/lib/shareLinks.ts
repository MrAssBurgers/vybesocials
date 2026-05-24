/**
 * Build shareable, crawler-friendly URLs that render link previews
 * (OG/Twitter cards) for any client (iMessage, Slack, Discord, X,
 * LinkedIn, WhatsApp). Humans get instantly redirected to the in-app route.
 *
 * Routes through the public `share-preview` edge function because Vite SPAs
 * cannot serve per-page OG meta to non-JS crawlers.
 */
const PROJECT_REF = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const BASE = `https://${PROJECT_REF}.supabase.co/functions/v1/share-preview`;

export function buildPostShareUrl(postId: string): string {
  return `${BASE}?type=post&id=${encodeURIComponent(postId)}`;
}

export function buildProfileShareUrl(username: string): string {
  return `${BASE}?type=profile&username=${encodeURIComponent(username)}`;
}
