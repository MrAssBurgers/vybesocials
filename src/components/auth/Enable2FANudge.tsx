import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';

const STORAGE_KEY = 'vybe-2fa-nudge-dismissed-at';
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MOUNT_DELAY_MS = 4000; // don't show immediately on app open

/**
 * Soft prompt asking signed-in users to enable 2-step verification so they
 * don't lose access to their account. Shown at most once per 7 days, never
 * shown to users who already have email 2FA or login approvals enabled.
 */
export function Enable2FANudge() {
  const { user, authReady } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!authReady || !user) return;

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        // Respect prior dismissal window
        const lastDismissed = Number(localStorage.getItem(STORAGE_KEY) || '0');
        if (Date.now() - lastDismissed < REMIND_AFTER_MS) return;

        const { data } = await db
          .from('user_2fa_settings')
          .select('email_2fa_enabled, login_approvals_enabled')
          .eq('user_id', user.id)
          .maybeSingle();

        const hasFactor = !!(data?.email_2fa_enabled || data?.login_approvals_enabled);
        if (!hasFactor && !cancelled) setOpen(true);
      } catch {
        // Silent — never block the app on this
      }
    }, MOUNT_DELAY_MS);

    return () => { cancelled = true; clearTimeout(t); };
  }, [user?.id, authReady]);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
    setOpen(false);
  };

  const enableNow = () => {
    dismiss();
    navigate('/settings?tab=security');
  };

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && dismiss()}>
      <SheetContent side="bottom" className="rounded-t-3xl border-t border-border/40 bg-card pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <SheetTitle className="text-lg">Protect your account</SheetTitle>
          </div>
          <SheetDescription className="text-sm leading-relaxed">
            Turn on 2-step verification so you never lose access to your VYBE — even if your password leaks.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-5 flex flex-col gap-2">
          <Button
            onClick={enableNow}
            className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Turn on 2-step verification
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
