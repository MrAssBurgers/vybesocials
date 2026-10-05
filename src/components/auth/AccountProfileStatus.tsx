import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { profileAccountGuard } from '@/lib/profileAccountGuard';
import { Button } from '@/components/ui/button';

export default function AccountProfileStatus() {
  const session = useReportAccountSession();
  return <ProfileStatus key={`${session.uid}:${session.epoch}`} />;
}

function ProfileStatus() {
  const { user, profileSetupError, profileSetupLoading, retryProfileSetup, recoverProfileSetup, signOut } = useAuth();
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState('');
  const active = useRef(true);
  const busy = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const run = async (action: () => Promise<void>) => {
    if (busy.current || profileSetupLoading || !user) return;
    let guard: () => void;
    try { guard = profileAccountGuard(user.id, () => { if (!active.current) throw new Error('Closed'); }); }
    catch { return; }
    busy.current = true; setWorking(true); setActionError('');
    try { await action(); }
    catch { try { guard(); setActionError('That did not finish. Please try again.'); } catch { /* retired account/view */ } }
    finally { busy.current = false; if (active.current) setWorking(false); }
  };
  const failed = !!profileSetupError;
  return <main className="min-h-[100dvh] flex items-center justify-center px-6 bg-background">
    <section className="w-full max-w-sm rounded-3xl border border-primary/20 bg-primary/5 p-7 text-center space-y-4" role={failed ? 'alert' : 'status'} aria-label={failed ? 'Profile setup needs attention' : 'Loading your profile'}>
      {!failed && <div aria-hidden className="mx-auto h-9 w-9 rounded-full border-[3px] border-primary/25 border-t-primary animate-spin" />}
      <h1 className="text-xl font-semibold">{failed ? profileSetupError.title || 'Your profile couldn’t be loaded' : 'Loading your profile…'}</h1>
      <p className="text-sm text-muted-foreground">{profileSetupError?.message || 'Your account is signed in. We’re loading your profile and preferences.'}</p>
      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      {failed && <div className="flex flex-col gap-2">
        <Button disabled={working || profileSetupLoading} onClick={() => void run(retryProfileSetup)}>Try again</Button>
        {profileSetupError.recoveryAvailable && <Button variant="outline" disabled={working || profileSetupLoading} onClick={() => void run(recoverProfileSetup)}>Recover my profile</Button>}
        <Button variant="ghost" disabled={working || profileSetupLoading} onClick={() => void run(signOut)}>Sign out</Button>
      </div>}
    </section>
  </main>;
}
