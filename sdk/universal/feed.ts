import type { VybeIntegration, PublicFeedOptions, PublicFeedPost } from './index.js';

export type PublicFeedClient = Pick<VybeIntegration, 'authorization' | 'browsePublicFeed'>;
export interface PublicFeedPanel { clear(): void; dispose(): void }

/** Trusted host UI. Shadow DOM isolates styles, not security. Media loads only on selection. */
export function mountPublicFeed(target: HTMLElement, client: PublicFeedClient): PublicFeedPanel {
  const root = target.attachShadow({ mode: 'open' });
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const element = document.createElement(tag); if (text) element.textContent = text; return element;
  };
  const style = node('style');
  style.textContent = `
    :host{display:block;color:#f5f3ff;font:15px/1.5 system-ui,sans-serif;color-scheme:dark}*{box-sizing:border-box}
    section{padding:24px;border:1px solid #ffffff18;border-radius:30px;background:radial-gradient(ellipse at 8% 0,#c656a42b,transparent 60%),radial-gradient(ellipse at 100% 85%,#3bada521,transparent 65%),#151725}
    h2{font-size:26px;letter-spacing:-.8px;margin:4px 0}p{overflow-wrap:anywhere;white-space:pre-wrap;color:#cecadb;margin:8px 0 16px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:2px;color:#b4e0df}
    .actions{display:flex;gap:8px;flex-wrap:wrap}button,select{font:inherit;color:inherit;min-height:44px;padding:10px 16px;border-radius:20px;border:1px solid #ffffff24;background:#ffffff09}
    button{cursor:pointer;transition:background .2s,transform .2s}button:hover{background:#ffffff18}button:active{transform:scale(.98)}button:disabled{opacity:.45;cursor:default}button:focus-visible,select:focus-visible{outline:3px solid #cdb3fc;outline-offset:3px}
    .primary{background:linear-gradient(115deg,#81446a,#42617f)}label{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:16px 0}select{max-width:100%}
    ol{padding:0;list-style:none;display:grid;gap:14px;margin:20px 0}li{padding:20px;border-radius:24px;border:1px solid #ffffff12;background:#ffffff05;animation:arrive .35s ease-out}
    .author{font-weight:650;color:#f3eafd}.caption{color:#eeeaf5}small{display:block;color:#b7b4c8}figure{margin:16px 0 0}img,video{display:block;width:100%;max-height:420px;object-fit:contain;border-radius:18px;background:#111321}.media-actions{margin-top:12px}
    [hidden]{display:none!important}@keyframes arrive{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){li{animation:none}button{transition:none;transform:none}}@media(max-width:420px){section{padding:18px}li{padding:16px}}
  `;
  const panel = node('section'); panel.setAttribute('aria-label', 'VYBE public feed');
  const eyebrow = node('span', 'VYBE · DISCOVER'); eyebrow.className = 'eyebrow';
  const title = node('h2', 'A little inspiration, in your world.');
  const intro = node('p', 'Explore public moments without leaving your game. Choose a photo or clip to load its media.');
  const filter = node('select'); filter.setAttribute('aria-label', 'Post type');
  for (const [value, label] of [['', 'All moments'], ['post', 'Posts'], ['short', 'Clips'], ['video', 'Videos']]) { const option = node('option', label); option.value = value; filter.append(option); }
  const label = node('label', 'Explore'); label.append(filter);
  const actions = node('div'); actions.className = 'actions';
  const refresh = node('button', 'Explore moments'); refresh.className = 'primary';
  const more = node('button', 'Next page'); more.hidden = true;
  const cancel = node('button', 'Cancel'); cancel.hidden = true;
  const close = node('button', 'Close feed'); close.hidden = true;
  for (const button of [refresh, more, cancel, close]) button.type = 'button';
  actions.append(refresh, more, cancel, close);
  const notice = node('p', 'Connect with public browsing permission to explore.'); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  const list = node('ol'); list.setAttribute('aria-label', 'Public moments');
  const foot = node('small', 'Public posts marked safe. Labels are not independent content verification. Media loads from its source when you select it.');
  panel.append(eyebrow, title, intro, label, actions, notice, list, foot); root.append(style, panel);
  let disposed = false, connection: string | null = null, operation: AbortController | null = null;
  let cursor: string | null = null, pageCursor: string | undefined, rows: PublicFeedPost[] = [], expiresAt = 0;
  let media: HTMLElement | null = null;
  const stopMedia = () => {
    if (!media) return;
    for (const element of Array.from(media.querySelectorAll('img,video'))) {
      if (element instanceof HTMLVideoElement) element.pause();
      element.removeAttribute('src'); if (element instanceof HTMLVideoElement) element.load();
    }
    media.remove(); media = null;
  };
  const clear = () => {
    operation?.abort(); operation = null; stopMedia(); connection = null; cursor = null; pageCursor = undefined; rows = []; expiresAt = 0;
    list.replaceChildren(); more.hidden = true; close.hidden = true; cancel.hidden = true; refresh.disabled = false; more.disabled = false; filter.disabled = false;
    notice.textContent = 'Your feed is closed. Explore moments when you’re ready.';
  };
  const current = (id: string) => !disposed && !document.hidden && client.authorization?.connectionId === id && client.authorization.scopes.includes('feed:read_public');
  function render() {
    stopMedia(); list.replaceChildren();
    for (const post of rows) {
      const item = node('li'), author = node('div', post.author.displayName || `@${post.author.username}`); author.className = 'author';
      const date = node('small', `@${post.author.username} · ${new Date(post.createdAt).toLocaleDateString()}`);
      const caption = node('p', post.caption); caption.className = 'caption';
      item.append(author, date, caption);
      const urls = [...new Set([post.mediaUrl, ...post.mediaUrls].filter((url): url is string => !!url))];
      if (urls.length) {
        const show = node('button', post.type === 'post' ? 'View media' : 'Watch clip'); show.type = 'button';
        show.onclick = () => {
          if (!connection || !current(connection) || Date.now() >= expiresAt) { clear(); return; }
          stopMedia(); const figure = node('figure'); media = figure; let index = 0;
          const player = post.type === 'post' ? node('img') : node('video');
          player.crossOrigin = 'anonymous';
          if (player instanceof HTMLImageElement) { player.alt = post.caption || 'Public VYBE moment'; player.referrerPolicy = 'no-referrer'; }
          else { player.controls = true; player.playsInline = true; player.preload = 'none'; player.crossOrigin = 'anonymous'; }
          const showItem = () => { player.src = urls[index]; };
          player.onerror = () => { if (media === figure) { stopMedia(); notice.textContent = 'This media could not be displayed. Choose another moment or refresh.'; } };
          const controls = node('div'); controls.className = 'actions media-actions';
          if (urls.length > 1) {
            const next = node('button', 'Next media'); next.type = 'button'; next.onclick = () => { if (!connection || !current(connection)) { clear(); return; } index = (index + 1) % urls.length; showItem(); }; controls.append(next);
          }
          const hide = node('button', 'Close media'); hide.type = 'button'; hide.onclick = () => { stopMedia(); show.focus(); }; controls.append(hide);
          figure.append(player, controls); item.append(figure); showItem();
        }; item.append(show);
      }
      list.append(item);
    }
    more.hidden = !cursor; close.hidden = false;
  }
  async function load(next = false, recheck = false) {
    if (disposed || operation || document.hidden) return;
    const auth = client.authorization;
    if (!auth || !auth.scopes.includes('feed:read_public')) { clear(); notice.textContent = 'Connect with public browsing permission to explore.'; return; }
    const selectedCursor = recheck ? pageCursor : next ? cursor ?? undefined : undefined;
    if (connection !== auth.connectionId) clear();
    connection = auth.connectionId; const controller = new AbortController(); operation = controller;
    refresh.disabled = true; more.disabled = true; filter.disabled = true; cancel.hidden = false;
    if (!recheck) { stopMedia(); notice.textContent = 'Finding your next inspiration…'; }
    try {
      const page = await client.browsePublicFeed({ cursor: selectedCursor, contentType: filter.value ? filter.value as PublicFeedOptions['contentType'] : undefined, signal: controller.signal });
      if (operation !== controller || controller.signal.aborted || !current(auth.connectionId)) return;
      const changed = JSON.stringify(page.posts) !== JSON.stringify(rows);
      rows = page.posts; cursor = page.nextCursor; pageCursor = selectedCursor; expiresAt = page.expiresAt;
      if (!recheck || changed) render(); else more.hidden = !cursor;
      notice.textContent = rows.length ? `${rows.length} public moment${rows.length === 1 ? '' : 's'} · Refreshed while this panel is open.` : cursor ? 'No matching moments on this page. Try the next page.' : 'Fresh moments are on their way. Try another filter or check back later.';
    } catch {
      if (operation === controller) { clear(); notice.textContent = 'The feed changed or access could not be checked. Explore again to refresh, or reconnect VYBE.'; }
    } finally {
      if (operation === controller) { operation = null; refresh.disabled = false; more.disabled = false; filter.disabled = false; cancel.hidden = true; }
    }
  }
  refresh.onclick = () => { void load(); }; more.onclick = () => { if (cursor) void load(true); };
  cancel.onclick = close.onclick = clear;
  filter.onchange = () => { clear(); void load(); };
  const hidden = () => { if (document.hidden) clear(); }; document.addEventListener('visibilitychange', hidden);
  const lifecycle = window.setInterval(() => { if (connection && (!current(connection) || (expiresAt && Date.now() >= expiresAt))) clear(); }, 1000);
  const revalidate = window.setInterval(() => { if (connection) void load(false, true); }, 30000);
  return { clear, dispose() { if (disposed) return; disposed = true; clear(); document.removeEventListener('visibilitychange', hidden); window.clearInterval(lifecycle); window.clearInterval(revalidate); root.replaceChildren(); } };
}
