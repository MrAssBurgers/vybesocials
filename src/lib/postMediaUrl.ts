import { isLocalPreview, LOCAL_PREVIEW_PORTS } from '@/lib/firebase/localPreview';

export function validPostMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash || value.length > 8192) return false;
    if (url.protocol === 'https:') return true;
    if (isLocalPreview() && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.port === '8082'
      && /^\/v0\/b\/demo-vybe-preview\.appspot\.com\/o\//.test(url.pathname)) return true;
    return isLocalPreview() && url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === String(LOCAL_PREVIEW_PORTS.storage)
      && /^\/v0\/b\/demo-vybe-preview(?:\.appspot\.com|\.firebasestorage\.app)?\/o\//.test(url.pathname);
  } catch { return false; }
}
