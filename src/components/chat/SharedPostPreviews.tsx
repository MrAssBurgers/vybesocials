import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { readSocialPostPreviews, type SocialPostPreview } from '@/lib/socialFeedService';

type Entry = { status: 'queued' | 'loading' | 'ready' | 'unavailable' | 'error'; post?: SocialPostPreview; expires: number };
const pending: Entry = { status: 'queued', expires: 0 };
const unavailable: Entry = { status: 'unavailable', expires: 0 };
const LEASE_MS = 30000;
const validId = (id: string) => !!id && !id.includes('/') && id.length <= 1500;

/** Only visible IDs are retained. One request batches up to 20 previews. */
export class SharedPostPreviewStore {
  private counts = new Map<string, number>();
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private version = 0;
  private generation = 0;
  private active = false;
  private visible = true;
  private running = false;
  private nextRequest = 0;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private load: (ids: string[], guard: () => void) => Promise<SocialPostPreview[]>) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.version;
  private emit() { this.version++; this.listeners.forEach(listener => listener()); }
  get(id: string): Entry { return validId(id) && this.active && this.visible ? this.entries.get(id) || pending : unavailable; }
  observe(id: string) {
    if (!validId(id)) return () => {};
    this.counts.set(id, (this.counts.get(id) || 0) + 1);
    if (!this.entries.has(id)) this.entries.set(id, pending);
    this.emit();
    return () => {
      const count = (this.counts.get(id) || 1) - 1;
      if (count) this.counts.set(id, count);
      else { this.counts.delete(id); this.entries.delete(id); }
      this.emit();
    };
  }
  retry(id: string) { if (this.counts.has(id)) { this.entries.set(id, pending); this.emit(); } }
  setVisible(visible: boolean) {
    this.visible = visible; this.generation++;
    this.entries.clear();
    for (const id of this.counts.keys()) this.entries.set(id, pending);
    this.emit();
  }
  start() {
    this.active = true; this.visible = document.visibilityState !== 'hidden'; this.emit();
    this.timer = setInterval(() => { void this.tick(); }, 500);
    return () => { this.active = false; this.generation++; clearInterval(this.timer); this.entries.clear(); this.emit(); };
  }
  private async tick() {
    if (!this.active || !this.visible) return;
    const now = Date.now(); let expired = false;
    for (const [id, entry] of this.entries) {
      if ((entry.status === 'ready' || entry.status === 'unavailable') && entry.expires <= now) {
        this.entries.set(id, pending); expired = true;
      }
    }
    if (expired) this.emit();
    if (this.running || now < this.nextRequest) return;
    const ids = [...this.counts.keys()].filter(id => {
      const entry = this.entries.get(id);
      return entry?.status === 'queued' || ((entry?.status === 'ready' || entry?.status === 'unavailable') && entry.expires <= now + 5000);
    }).slice(0, 20);
    if (!ids.length) return;
    this.running = true; this.nextRequest = now + 2500;
    const generation = this.generation;
    const guard = () => { if (!this.active || !this.visible || generation !== this.generation) throw new Error('Preview session changed.'); };
    // Renew before expiry without unmounting playing media. The expiry sweep
    // above still removes content on time if renewal is slow or never settles.
    for (const id of ids) if (this.entries.get(id)?.status === 'queued') this.entries.set(id, { status: 'loading', expires: 0 });
    this.emit();
    try {
      const posts = await this.load(ids, guard); guard();
      for (const id of ids) if (this.counts.has(id)) {
        const post = posts.find(row => row.id === id);
        this.entries.set(id, Date.now() >= now + LEASE_MS ? pending : { status: post ? 'ready' : 'unavailable', post, expires: now + LEASE_MS });
      }
    } catch {
      if (this.active && this.visible && generation === this.generation) for (const id of ids) if (this.counts.has(id)) this.entries.set(id, { status: 'error', expires: 0 });
    } finally { this.running = false; this.emit(); }
  }
}
const Context = createContext<SharedPostPreviewStore | null>(null);
export function SharedPostPreviewProvider({ conversationId, children }: { conversationId: string; children: ReactNode }) {
  const account = useProfileAccount();
  const key = `${account.session.uid}:${account.session.epoch}:${account.profile?.id}:${conversationId}:${account.ready}`;
  return <PreviewSession key={key} account={account}>{children}</PreviewSession>;
}
function PreviewSession({ account, children }: { account: ReturnType<typeof useProfileAccount>; children: ReactNode }) {
  const [store] = useState(() => account.ready ? new SharedPostPreviewStore((postIds, guard) => readSocialPostPreviews({
    expectedOwnerUid: account.user!.id, expectedProfileId: account.profile!.id, postIds,
  }, () => { account.guard(); guard(); })) : null);
  useEffect(() => {
    if (!store) return;
    const stop = store.start();
    const visibility = () => store.setVisible(document.visibilityState !== 'hidden');
    const hide = () => store.setVisible(false);
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', hide); window.addEventListener('pageshow', visibility);
    return () => { stop(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', visibility); };
  }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
const noopSubscribe = () => () => {};
const emptySnapshot = () => 0;
export function useSharedPostPreview(id: string) {
  const store = useContext(Context);
  const ref = useRef<HTMLDivElement>(null);
  useSyncExternalStore(store?.subscribe || noopSubscribe, store?.snapshot || emptySnapshot);
  useEffect(() => {
    if (!store || !ref.current) return;
    let release: (() => void) | undefined;
    if (typeof IntersectionObserver === 'undefined') return store.observe(id);
    const observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting);
      if (visible && !release) release = store.observe(id);
      else if (!visible && release) { release(); release = undefined; }
    });
    observer.observe(ref.current);
    return () => { observer.disconnect(); release?.(); };
  }, [id, store]);
  return { ref, entry: store?.get(id) || unavailable, retry: () => store?.retry(id) };
}

/** Detail pages retain their checked post while mounted, including when scrolled. */
export function useActivePostPreview(id: string) {
  const store = useContext(Context);
  useSyncExternalStore(store?.subscribe || noopSubscribe, store?.snapshot || emptySnapshot);
  useEffect(() => store?.observe(id), [id, store]);
  return { entry: store?.get(id) || unavailable, retry: () => store?.retry(id) };
}
