import { useState, useCallback } from 'react';
import { Lock, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLockedChatIds } from '@/hooks/useLockedChats';
import { ensureStringSet } from '@/lib/persistedCollections';

interface LockedChatGateProps {
  conversationId: string;
  children: React.ReactNode;
}

const PASSCODE_KEY = 'vybe_dm_lock_passcode';

function readStoredPasscode(): string | null {
  try {
    return localStorage.getItem(PASSCODE_KEY);
  } catch {
    return null;
  }
}

/** Blocks locked DM threads until passcode unlock (web fallback). */
export function LockedChatGate({ conversationId, children }: LockedChatGateProps) {
  const { data: lockedIdsRaw } = useLockedChatIds();
  const lockedIds = ensureStringSet(lockedIdsRaw);
  const isLocked = lockedIds.has(conversationId);
  const [unlocked, setUnlocked] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tryUnlock = useCallback(() => {
    const stored = readStoredPasscode();
    if (!stored) {
      setError('Set a passcode in chat settings to unlock on web.');
      return;
    }
    if (passcode === stored) {
      setUnlocked(true);
      setError(null);
    } else {
      setError('Incorrect passcode');
    }
  }, [passcode]);

  if (!isLocked || unlocked) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-0 p-8 text-center bg-background/80 backdrop-blur-sm">
      <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Lock className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-lg font-semibold mb-1">Locked chat</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        Enter your passcode to view this conversation.
      </p>
      <div className="w-full max-w-xs space-y-3">
        <Input
          type="password"
          inputMode="numeric"
          placeholder="Passcode"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && tryUnlock()}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button className="w-full gap-2" onClick={tryUnlock}>
          <Fingerprint className="h-4 w-4" />
          Unlock
        </Button>
      </div>
    </div>
  );
}

export function storeDmLockPasscode(code: string) {
  try {
    localStorage.setItem(PASSCODE_KEY, code);
  } catch {
    /* ignore */
  }
}
