/**
 * Friend Link NFC — shared parsing and cross-platform listen sessions.
 * Despia: official one-shot `nfc://read` re-armed via `startDespiaNfcReadLoop`.
 * Web: Android Chrome NDEFReader (bidirectional read/write on tag contact).
 */

import { isDespiaRuntime, isAndroidUA, isIOSUA } from '@/lib/despiaBridge';
import { despiaReadNFC, startDespiaNfcReadLoop } from '@/lib/despiaNFCv2';

export type FriendLinkTarget = { type: 'drop' | 'user'; id: string };

const APP_HOST = 'vybehub.app';

export function decodeNfcText(text: string): string {
  const trimmed = text.trim();
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export function extractFriendTarget(text: string): FriendLinkTarget | null {
  const decoded = decodeNfcText(text);
  const dropMatch = decoded.match(/(?:https?:\/\/[^\s]+)?\/friend-drop\/([a-zA-Z0-9-]+)/);
  if (dropMatch) return { type: 'drop', id: dropMatch[1] };
  const userMatch = decoded.match(/(?:https?:\/\/[^\s]+)?\/add-friend\/([a-zA-Z0-9-]+)/);
  if (userMatch) return { type: 'user', id: userMatch[1] };
  const schemeMatch = decoded.match(/^vybe:friend:([a-zA-Z0-9-]+)$/);
  if (schemeMatch) return { type: 'user', id: schemeMatch[1] };
  return null;
}

export function buildFriendDropUrl(dropId: string): string {
  return `https://${APP_HOST}/friend-drop/${dropId}`;
}

export function buildAddFriendUrl(userId: string): string {
  return `https://${APP_HOST}/add-friend/${userId}`;
}

export interface FriendLinkNfcSessionOptions {
  /**
   * Our share URL — used only for Web NFC write-on-read (Chrome Android).
   * Despia never writes during Friend Link listen (read-only per official API).
   */
  broadcastUrl: string;
  onTarget: (target: FriendLinkTarget) => void;
  signal?: AbortSignal;
}

/**
 * Active Friend Link listen session.
 * Returns cleanup.
 */
export async function startFriendLinkNfcSession(
  options: FriendLinkNfcSessionOptions,
): Promise<() => void> {
  const { broadcastUrl, onTarget, signal } = options;
  const cleanups: Array<() => void> = [];
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cleanups.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  };

  signal?.addEventListener('abort', dispose, { once: true });
  if (signal?.aborted) {
    dispose();
    return dispose;
  }

  const emitIfValid = (raw: string) => {
    if (disposed) return;
    const target = extractFriendTarget(raw);
    if (target) onTarget(target);
  };

  if (isDespiaRuntime()) {
    cleanups.push(
      startDespiaNfcReadLoop({
        signal,
        onPayload: (data) => emitIfValid(data),
        onDismissed: () => {
          console.log('[friendLinkNfc] NFC sheet dismissed — read will re-arm');
        },
        onError: (msg) => {
          console.warn('[friendLinkNfc] NFC error:', msg);
        },
      }),
    );
  }

  const hasWebNfc =
    typeof window !== 'undefined' && 'NDEFReader' in window && isAndroidUA() && !isDespiaRuntime();

  if (hasWebNfc && broadcastUrl) {
    const NDEFReader = (window as Window & { NDEFReader: new () => NDEFReader }).NDEFReader;
    const ctrl = new AbortController();
    cleanups.push(() => ctrl.abort());
    signal?.addEventListener('abort', () => ctrl.abort(), { once: true });

    try {
      const ndef = new NDEFReader();
      await ndef.scan({ signal: ctrl.signal });

      const onReading = async (event: NDEFReadingEvent) => {
        if (disposed) return;
        for (const record of event.message.records) {
          try {
            const decoder = new TextDecoder(record.encoding || 'utf-8');
            emitIfValid(decoder.decode(record.data));
          } catch {
            /* ignore */
          }
        }
        try {
          await ndef.write({
            records: [{ recordType: 'url', data: broadcastUrl }],
          });
        } catch {
          /* P2P write may fail — read path still works */
        }
      };

      ndef.addEventListener('reading', onReading);
      cleanups.push(() => ndef.removeEventListener('reading', onReading));
    } catch (err) {
      console.warn('[friendLinkNfc] Web NFC session failed:', err);
    }
  }

  if (!isDespiaRuntime() && isIOSUA()) {
    console.log('[friendLinkNfc] iOS browser — NFC requires the VYBE app');
  }

  return dispose;
}

/** One-shot read (manual retry button). Uses official single `nfc://read`. */
export async function scanFriendLinkOnce(): Promise<FriendLinkTarget | null> {
  if (!isDespiaRuntime()) return null;
  const result = await despiaReadNFC(60_000);
  if (result.ok && result.payload) return extractFriendTarget(result.payload);
  return null;
}
