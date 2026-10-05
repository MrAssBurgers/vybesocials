import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { readSignInPreferences } from '@/lib/securitySettingsService';
import { tokenAccountGuard } from '@/lib/tokenMarketplaceService';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';
import { getConsentState } from '@/lib/crashReportConsent';

const STORAGE_KEY = 'vybe-2fa-nudge-dismissed-at';
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MOUNT_DELAY_MS = 4000; // don't show immediately on app open

/**
 * Only offer sign-in confirmation when the server says it is available.
 * This preference is not a guarantee of server-enforced MFA protection.
 */
export function Enable2FANudge() {
  const { user, authReady } = useAuth();
  const account = useReportAccountSession();
  const scope = user && account.uid === user.id ? `${user.id}:${account.epoch}` : null;
  const navigate = useNavigate();
  const [openScope, setOpenScope] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady || !user || !scope) return;
    const guard = tokenAccountGuard(user.id);

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        // Respect prior dismissal window
        const lastDismissed = Number(localStorage.getItem(`${STORAGE_KEY}:${user.id}`) || '0');
        if (Date.now() - lastDismissed < REMIND_AFTER_MS) return;

        // Crash consent uses the same screen. Wait until that choice is stored
        // so the two prompts do not stack on top of a clip.
        if (getConsentState() === null) return;

        const data = await readSignInPreferences(user.id, guard);
        guard();
        if (cancelled) return;
        const available = data.capabilities.enableEmailConfirmation || data.capabilities.enableLoginApprovals;
        if (available && !data.settings.email_2fa_enabled && !data.settings.login_approvals_enabled) setOpenScope(scope);
      } catch {
        // Silent — never block the app on this
      }
    }, MOUNT_DELAY_MS);

    return () => { cancelled = true; clearTimeout(t); };
  }, [user?.id, authReady, scope]);

  const dismiss = () => {
    if (user) try { localStorage.setItem(`${STORAGE_KEY}:${user.id}`, String(Date.now())); } catch {}
    setOpenScope(null);
  };

  const enableNow = () => {
    dismiss();
    navigate('/settings?tab=security');
  };

  if (!user) return null;

  return (
    <Sheet open={!!scope && openScope === scope} onOpenChange={(o) => !o && dismiss()}>
      <SheetContent side="bottom" className="rounded-t-3xl border-t border-border/40 bg-card pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <SheetTitle className="text-lg">Protect your account</SheetTitle>
          </div>
          <SheetDescription className="text-sm leading-relaxed">
            Review the available confirmation options for future sign-ins.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-5 flex flex-col gap-2">
          <Button
            onClick={enableNow}
            className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Review sign-in confirmation
          </Button>
          <Button
            onClick={dismiss}
            variant="ghost"
            className="w-full h-10 text-muted-foreground hover:text-foreground"
          >
            Remind me later
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
