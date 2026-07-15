import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { getFirebaseConfig } from '@/lib/firebase/config';
import { getFirebaseAuthDomain, getFirebaseAuthHandlerUrl } from '@/lib/firebase/authDomain';
import { detectOAuthPlatform } from '@/lib/oauthPlatform';
import {
  hasSavedOAuthRedirectState,
  getSavedOAuthProvider,
  getSavedOAuthReturnPath,
} from '@/lib/firebase/oauthRedirect';
import { isStandaloneApp } from '@/lib/deviceDetection';

function storageWorks(kind: 'session' | 'local'): boolean {
  try {
    const key = '__vybe_auth_diag__';
    const store = kind === 'session' ? sessionStorage : localStorage;
    store.setItem(key, '1');
    const ok = store.getItem(key) === '1';
    store.removeItem(key);
    return ok;
  } catch {
    return false;
  }
}

/** DEV-only diagnostics — no tokens. */
export default function AuthDiagnostics() {
  const { user, authReady, loading } = useAuth();
  const [tick] = useState(() => Date.now());
  const platform = useMemo(() => detectOAuthPlatform(), [tick]);

  let config: ReturnType<typeof getFirebaseConfig> | null = null;
  let configError: string | null = null;
  try {
    config = getFirebaseConfig();
  } catch (e) {
    configError = e instanceof Error ? e.message : 'config error';
  }

  const authDomain = config?.authDomain || getFirebaseAuthDomain();
  const handlerUrl = getFirebaseAuthHandlerUrl(authDomain);

  const rows: Array<[string, string]> = [
    ['hostname', typeof location !== 'undefined' ? location.hostname : ''],
    ['origin', typeof location !== 'undefined' ? location.origin : ''],
    ['userAgent', typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 160) : ''],
    ['strategy', platform.strategy],
    ['isDespia', String(platform.isDespia)],
    ['isCapacitorNative', String(platform.isCapacitorNative)],
    ['isStandalonePWA', String(isStandaloneApp())],
    ['isMobileSafari', String(platform.isMobileSafari)],
    ['isAndroidWebView', String(platform.isAndroidWebView)],
    ['supportsReliablePopup', String(platform.supportsReliablePopup)],
    ['projectId', config?.projectId || configError || ''],
    ['authDomain', authDomain],
    ['authHandlerUrl', handlerUrl],
    ['firebaseUid', user?.id || 'signed_out'],
    ['authReady', String(authReady)],
    ['loading', String(loading)],
    ['redirectState', String(hasSavedOAuthRedirectState())],
    ['savedProvider', getSavedOAuthProvider() || '—'],
    ['savedReturnPath', getSavedOAuthReturnPath() || '—'],
    ['sessionStorage', String(storageWorks('session'))],
    ['localStorage', String(storageWorks('local'))],
  ];

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">Auth diagnostics</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Development only. Does not show tokens or private keys.
      </p>
      <dl className="space-y-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[10rem_1fr] gap-2 border-b border-border/60 pb-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="break-all font-mono text-xs">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
