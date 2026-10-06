import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { savePrivateProfileDateOfBirth } from '@/lib/profilePrivate';

export default function DiscoveryBirthdayReview({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const actor = useProfileAccount();
  const scope = JSON.stringify([actor.user?.id, actor.profile?.id, actor.session.epoch]);
  const [openedFor] = useState(scope);
  const context = useMemo(() => ({ active: true }), [actor.user?.id, actor.profile?.id, actor.session.epoch]);
  useEffect(() => { context.active = true; return () => { context.active = false; }; }, [context]);
  useEffect(() => { if (scope !== openedFor) { context.active = false; onClose(); } }, [scope, openedFor]);
  const [date, setDate] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const close = () => { context.active = false; onClose(); };
  const save = async () => {
    const guard = () => { actor.guard(); if (!context.active || scope !== openedFor) throw new Error('Birthday review closed.'); };
    try {
      guard(); if (busy) return;
      setBusy(true); setError('');
      await savePrivateProfileDateOfBirth({ authUid: actor.user!.id, profileId: actor.profile!.id, dateOfBirth: date }, guard);
      guard(); onSaved();
    } catch (failure) {
      try { guard(); } catch { return; }
      setError(failure instanceof Error ? failure.message : 'Your birthday could not be saved. Please retry.');
    } finally { if (context.active) setBusy(false); }
  };
  return <Dialog open onOpenChange={value => { if (!value) close(); }}><DialogContent>
    <DialogHeader><DialogTitle>Review your birthday</DialogTitle><DialogDescription>Use your real birthday. It stays private and helps us show age-appropriate suggestions.</DialogDescription></DialogHeader>
    <label htmlFor="discovery-birthday" className="text-sm font-medium">Birthday</label>
    <Input id="discovery-birthday" type="date" value={date} onChange={event => setDate(event.target.value)} disabled={busy} max={new Date().toISOString().slice(0, 10)} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>Cancel</Button><Button onClick={() => void save()} disabled={!date || busy || !actor.ready}>{busy ? 'Saving…' : 'Save birthday'}</Button></div>
  </DialogContent></Dialog>;
}
