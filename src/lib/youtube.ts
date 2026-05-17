/**
 * Extract a YouTube video ID from any URL-ish string.
 * Supports: youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, /embed/, /live/
 */
export function extractYouTubeId(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = String(input);

  // Direct ID (11 chars, alphanumeric + _ -)
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;

  const patterns: RegExp[] = [
    /(?:youtube\.com\/watch\?(?:[^&\s]*&)*v=)([a-zA-Z0-9_-]{11})/i,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/i,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Find the first YouTube video ID inside a free-form text blob. */
export function findFirstYouTubeId(text: string | null | undefined): string | null {
  if (!text) return null;
  const urlRegex = /https?:\/\/[^\s)]+/gi;
  const urls = text.match(urlRegex) ?? [];
  for (const u of urls) {
    const id = extractYouTubeId(u);
    if (id) return id;
  }
  // Also try whole text in case it's a bare youtu.be/ID
  return extractYouTubeId(text);
}
