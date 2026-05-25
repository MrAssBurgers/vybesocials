// Forces a phone number on file before the app is usable.
// Renders a non-dismissible modal when the signed-in user's profile has
// `phone_verified !== true`. Reuses PhoneNumberCard for the actual flow.
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { PhoneNumberCard } from '@/components/settings/PhoneNumberCard';
import { ShieldCheck } from 'lucide-react';

export function PhoneVerifyGate() {
  const { user, loading } = useAuth();
  const [needs, setNeeds] = useState<boolean>(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { setNeeds(false); setChecked(true); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('phone_verified')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setNeeds(!data?.phone_verified);
      setChecked(true);
    })();
    return () => { cancelled = true; };
  }, [user?.id, loading]);

  if (!checked || !needs) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) setNeeds(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Verify your phone</DialogTitle>
          <DialogDescription className="text-center">
            VYBE works best with a verified phone number — it secures your account and helps friends find you.
          </DialogDescription>
        </DialogHeader>
        <PhoneNumberCard embedded onVerified={() => setNeeds(false)} />
      </DialogContent>
    </Dialog>
  );
}
