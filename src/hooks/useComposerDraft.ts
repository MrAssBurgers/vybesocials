import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';

/**
 * Lightweight composer draft system.
 *
 * Uses localStorage so a user's in-progress caption / tags / visibility survive
 * accidental swipe-outs and navigations. Media files cannot be serialized to
 * localStorage, but a flag is kept so we can prompt the user to re-attach.
 *
 * Key is namespaced by user + composer kind so that posts, stories, and snaps
 * each have their own resumable draft.
 */
export type ComposerKind = 'post' | 'story' | 'snap' | 'short' | 'video';

export interface ComposerDraftPayload {
  caption?: string;
  tags?: string[];
  visibility?: string;
  /** Whether this draft originally had media attached (so we can hint the user) */
  hadMedia?: boolean;
  /** Free-form extra fields per composer */
  extra?: Record<string, unknown>;
}

interface StoredDraft extends ComposerDraftPayload {
  updatedAt: number;
}

const ttlMs = 14 * 24 * 60 * 60 * 1000; // 14 days

function storageKey(userId: string | null | undefined, kind: ComposerKind) {
  return `vybe.draft.${userId ?? 'anon'}.${kind}`;
}

function isMeaningful(d: ComposerDraftPayload): boolean {
  if (d.caption && d.caption.trim().length > 0) return true;
  if (d.tags && d.tags.length > 0) return true;
  if (d.hadMedia) return true;
  if (d.extra && Object.keys(d.extra).length > 0) return true;
  return false;
}

export function useComposerDraft(kind: ComposerKind) {
  const { user } = useAuth();
  const [existingDraft, setExistingDraft] = useState<StoredDraft | null>(null);
  const latestRef = useRef<ComposerDraftPayload | null>(null);
  const submittedRef = useRef(false);

  const key = storageKey(user?.id, kind);

  // Load any existing draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) { setExistingDraft(null); return; }
      const parsed = JSON.parse(raw) as StoredDraft;
      if (Date.now() - parsed.updatedAt > ttlMs) {
        localStorage.removeItem(key);
        setExistingDraft(null);
        return;
      }
      if (isMeaningful(parsed)) setExistingDraft(parsed);
      else { localStorage.removeItem(key); setExistingDraft(null); }
    } catch {
      setExistingDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /** Update what *would* be saved if the user navigates away. Cheap; no I/O. */
  const stage = useCallback((payload: ComposerDraftPayload) => {
    latestRef.current = payload;
  }, []);

  /** Mark the draft as resolved (post submitted). Prevents save-on-unmount. */
  const clear = useCallback(() => {
    submittedRef.current = true;
    try { localStorage.removeItem(key); } catch {}
    setExistingDraft(null);
    latestRef.current = null;
  }, [key]);

  /** Manually dismiss the existing-draft banner without losing typing. */
  const dismissExisting = useCallback(() => {
    try { localStorage.removeItem(key); } catch {}
    setExistingDraft(null);
  }, [key]);

  // Persist on unmount / page hide / pagebeforeunload
  useEffect(() => {
    const flush = () => {
      if (submittedRef.current) return;
      const data = latestRef.current;
      if (!data || !isMeaningful(data)) return;
      try {
        localStorage.setItem(key, JSON.stringify({ ...data, updatedAt: Date.now() }));
      } catch {}
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [key]);

  return { existingDraft, stage, clear, dismissExisting };
}
