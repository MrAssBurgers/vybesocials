import { saveClipsFeedTab } from '@/lib/clipsLayout';

export type PublishContentType = 'text' | 'post' | 'short' | 'video';

/** Where to land after a successful publish + which clips tab to restore. */
export function applyPostPublishNavigation(type: PublishContentType): string {
  if (type === 'short') {
    saveClipsFeedTab('foryou');
    return '/clips';
  }
  if (type === 'video') {
    saveClipsFeedTab('videos');
    return '/clips';
  }
  return '/home';
}
