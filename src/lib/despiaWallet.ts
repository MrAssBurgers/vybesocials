/**
 * Despia Wallet bridge — `wallet://pkpass` presents the native wallet sheet
 * pre-loaded with a `.pkpass` file at a publicly reachable HTTPS URL.
 *
 * Installs a single shared `window.onWalletEvent` dispatcher and resolves
 * each call with the outcome.
 */

import { despiaCall, isDespiaRuntime } from './despiaBridge';

type WalletStatus = 'presented' | 'dismissed' | 'failed';

interface WalletEvent {
  action?: string;
  status: WalletStatus;
  error?: string;
}

type Listener = (evt: WalletEvent) => boolean;

const listeners = new Set<Listener>();
let installed = false;

function installDispatcher() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const w = window as any;
  const prev = w.onWalletEvent;
  w.onWalletEvent = (evt: WalletEvent) => {
    try {
      for (const l of Array.from(listeners)) {
        try {
          if (l(evt)) {
            listeners.delete(l);
            break;
          }
        } catch (err) {
          console.warn('[despiaWallet] listener threw', err);
        }
      }
    } finally {
      if (typeof prev === 'function') {
        try { prev(evt); } catch {}
      }
    }
  };
}

export interface AddPassResult {
  ok: boolean;
  dismissed?: boolean;
  error?: string;
}

/**
 * Add a `.pkpass` file (hosted at a public https URL) to the user's wallet.
 *
 * Returns:
 *   { ok: true }            — the user added the pass (presented + not dismissed)
 *   { ok: false, dismissed: true } — sheet was shown but user cancelled
 *   { ok: false, error }    — anything else
 *
 * Note: outside the Despia runtime this returns { ok: false, error: 'not_despia' }.
 */
export async function addPassToWallet(url: string, timeoutMs = 120_000): Promise<AddPassResult> {
  if (!isDespiaRuntime()) return { ok: false, error: 'not_despia' };
  if (!/^https:\/\//i.test(url)) return { ok: false, error: 'invalid_url' };

  installDispatcher();

  return await new Promise<AddPassResult>((resolve) => {
    let settled = false;
    let presented = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      listeners.delete(listener);
      resolve({ ok: false, error: 'timeout' });
    }, timeoutMs);

    const finish = (result: AddPassResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      listeners.delete(listener);
      resolve(result);
    };

    const listener: Listener = (evt) => {
      if (evt.status === 'presented') {
        presented = true;
        return false; // keep listening for the final outcome
      }
      if (evt.status === 'dismissed') {
        // If we never saw `presented`, treat as user-cancelled too.
        finish({ ok: presented, dismissed: !presented ? true : true });
        return true;
      }
      if (evt.status === 'failed') {
        finish({ ok: false, error: evt.error || 'wallet_failed' });
        return true;
      }
      return false;
    };
    listeners.add(listener);

    void despiaCall(`wallet://pkpass?url=${encodeURIComponent(url)}`);
  });
}

/** Friendly message for a wallet error string. */
export function walletErrorMessage(error?: string): string {
  if (!error) return 'Could not add to wallet';
  if (error === 'invalid_url') return 'Pass URL must be a public https link';
  if (error === 'not_despia') return 'Wallet only available in the VYBE app';
  if (error === 'missing_or_invalid_url') return 'The pass link is invalid';
  if (error === 'cannot_add_passes') return "This device can't add wallet passes";
  if (error === 'no_presenter') return 'Could not show wallet sheet';
  if (error.startsWith('download_failed')) return 'Could not download the pass — check your connection';
  if (error.startsWith('invalid_pass')) return 'This pass file is not valid';
  if (error === 'timeout') return 'Wallet sheet timed out';
  return 'Could not add to wallet';
}
