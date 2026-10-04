import type { VybeIntegration, PartnerCaptureReceipt } from './index.js';

export type CaptureGalleryClient = Pick<VybeIntegration, 'authorization' | 'listCaptures' | 'getCapturePreview' | 'checkCapturePreview' | 'openReview'>;
export interface CaptureGallery { clear(): void; dispose(): void }

/** Mount in a trusted app/overlay document. No iframe, account cookie or automatic fetch. */
export function mountCaptureGallery(target: HTMLElement, client: CaptureGalleryClient): CaptureGallery {
  // The host is trusted; Shadow DOM isolates styling, not account authority.
  const root = target.attachShadow({ mode: 'open' });
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const result = document.createElement(tag); if (text) result.textContent = text; return result;
  };
  const style = node('style');
  style.textContent = `
    :host{display:block;color:#f5f3ff;font:15px/1.5 system-ui,sans-serif;color-scheme:dark}
    *{box-sizing:border-box}section{padding:24px;border:1px solid #ffffff17;border-radius:28px;background:radial-gradient(ellipse at 0 0,#93487624,transparent 65%),radial-gradient(ellipse at 100% 100%,#28788024,transparent 65%),#151725}
    h2{font-size:21px;letter-spacing:-.4px;margin:0}p{color:#c0bfce;overflow-wrap:anywhere;margin:8px 0 16px}.actions{display:flex;gap:8px;flex-wrap:wrap}
    button{font:inherit;color:inherit;min-height:44px;padding:10px 16px;border-radius:18px;border:1px solid #ffffff25;background:#ffffff0b;cursor:pointer;transition:background .2s,transform .2s}
    button:hover{background:#ffffff18}button:active{transform:scale(.98)}button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:3px solid #d8b7fa;outline-offset:3px}
    ul{list-style:none;display:grid;gap:12px;padding:0;margin:18px 0}li{padding:18px;border-radius:22px;background:#ffffff06;border:1px solid #ffffff12}
    small{color:#b8b6c9}figure{margin:16px 0 0}img,video{display:block;width:100%;max-height:420px;object-fit:contain;border-radius:18px;background:#131522}
    [hidden]{display:none!important}@media(prefers-reduced-motion:reduce){button{transition:none;transform:none}}
  `;
  const panel = node('section'); panel.setAttribute('aria-label', 'VYBE capture gallery');
  const title = node('h2', 'Your moments, right here');
  const intro = node('p', 'Private captures from this connection. Choose a moment to preview or open it in VYBE.');
  const actions = node('div'); actions.className = 'actions';
  const refresh = node('button', 'Load captures'); refresh.type = 'button';
  const more = node('button', 'Load more'); more.type = 'button'; more.hidden = true;
  const notice = node('p', 'Connect VYBE, then load your captures.'); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  const list = node('ul');
  actions.append(refresh, more); panel.append(title, intro, actions, notice, list); root.append(style, panel);
  let disposed = false; let operation: AbortController | null = null; let checking: AbortController | null = null;
  let connection: string | null = null; let cursor: string | null = null; let rows: PartnerCaptureReceipt[] = [];
  let preview: { id: string; url: string; figure: HTMLElement } | null = null;
  const closePreview = () => {
    checking?.abort(); checking = null;
    if (!preview) return;
    const video = preview.figure.querySelector('video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    preview.figure.remove(); URL.revokeObjectURL(preview.url); preview = null;
  };
  const clear = () => {
    operation?.abort(); operation = null; closePreview(); connection = null; cursor = null; rows = [];
    list.replaceChildren(); more.hidden = true; refresh.disabled = false; more.disabled = false;
    notice.textContent = 'Load captures to view this connection’s moments.';
  };
  const current = (id: string) => !disposed && !document.hidden && client.authorization?.connectionId === id;
  const errorText = (error: unknown) => error instanceof Error ? error.message : 'Could not load captures. Try again.';
  async function run(action: (signal: AbortSignal, id: string) => Promise<void>) {
    if (disposed || operation || document.hidden) return;
    const id = client.authorization?.connectionId;
    if (!id) { clear(); notice.textContent = 'Connect VYBE to view your captures.'; return; }
    if (connection !== id) clear();
    connection = id;
    const controller = new AbortController(); operation = controller; refresh.disabled = true; more.disabled = true;
    try { await action(controller.signal, id); }
    catch (error) { if (operation === controller && current(id)) { clear(); notice.textContent = errorText(error); } }
    finally { if (operation === controller) { operation = null; refresh.disabled = false; more.disabled = false; } }
  }
  function render() {
    list.replaceChildren();
    for (const capture of rows) {
      const item = node('li');
      const caption = node('p', capture.caption || 'A moment worth keeping');
      const state = node('small', capture.status === 'ready' ? 'Private · Ready to review' : capture.status === 'imported' ? 'Published in VYBE' : 'Upload in progress');
      const controls = node('div'); controls.className = 'actions';
      if (capture.status === 'ready' && client.authorization?.scopes.includes('capture:preview')) {
        const show = node('button', capture.contentType.startsWith('video/') ? 'Watch capture' : 'View capture'); show.type = 'button';
        show.onclick = () => { void run(async (signal, id) => {
          closePreview(); notice.textContent = 'Opening your moment…';
          const blob = await client.getCapturePreview(capture.captureId, { signal });
          if (!current(id) || signal.aborted) return;
          const figure = node('figure'); const url = URL.createObjectURL(blob);
          const media = capture.contentType.startsWith('video/') ? node('video') : node('img');
          if (media instanceof HTMLVideoElement) { media.controls = true; media.playsInline = true; media.preload = 'metadata'; }
          else media.alt = capture.caption || 'Private VYBE capture';
          media.onerror = () => {
            if (preview?.url !== url) return;
            closePreview(); notice.textContent = 'This capture could not be displayed. Try opening it in VYBE or choose another capture.';
          };
          media.src = url;
          const close = node('button', 'Close preview'); close.type = 'button'; close.onclick = () => { closePreview(); show.focus(); };
          figure.append(media, close); item.append(figure); preview = { id: capture.captureId, url, figure };
          notice.textContent = 'Only captures from this connection appear here.';
        }); };
        controls.append(show);
      }
      if (['ready', 'imported'].includes(capture.status)) {
        const review = node('button', 'Open in VYBE'); review.type = 'button';
        review.onclick = () => { if (!connection || !current(connection)) { clear(); return; } try { void client.openReview(capture.captureId).catch(error => { if (!disposed) notice.textContent = errorText(error); }); } catch (error) { notice.textContent = errorText(error); } };
        controls.append(review);
      }
      item.append(state, caption, controls); list.append(item);
    }
    more.hidden = !cursor;
  }
  async function load(append: boolean) {
    await run(async (signal, id) => {
      closePreview(); if (!append) { rows = []; cursor = null; render(); }
      notice.textContent = 'Finding your moments…';
      const page = await client.listCaptures({ ...(append && cursor ? { cursor } : {}), signal });
      if (!current(id) || signal.aborted) return;
      rows = append ? [...rows, ...page.captures] : page.captures; cursor = page.nextCursor;
      render(); notice.textContent = rows.length ? `${rows.length} capture${rows.length === 1 ? '' : 's'} from this connection.` : cursor ? 'No available captures on this page. Continue with Load more.' : 'Your next great moment belongs here. Send a capture to get started.';
    });
  }
  refresh.onclick = () => { void load(false); }; more.onclick = () => { if (cursor) void load(true); };
  const hidden = () => { if (document.hidden) clear(); };
  document.addEventListener('visibilitychange', hidden);
  const lifecycle = window.setInterval(() => { if (connection && !current(connection)) clear(); }, 1000);
  const recheck = window.setInterval(() => {
    if (!preview || !connection || checking || !current(connection)) return;
    const shown = preview; const controller = new AbortController(); checking = controller;
    void client.checkCapturePreview(shown.id, { signal: controller.signal }).catch(() => {
      if (preview === shown && !disposed) { clear(); notice.textContent = 'Access changed or could not be checked. Reload your captures to continue.'; }
    }).finally(() => { if (checking === controller) checking = null; });
  }, 15000);
  return { clear, dispose() {
    if (disposed) return; disposed = true; clear();
    document.removeEventListener('visibilitychange', hidden); window.clearInterval(lifecycle); window.clearInterval(recheck); root.replaceChildren();
  } };
}
