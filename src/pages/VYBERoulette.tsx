import { useEffect, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useRouletteMatch, type RouletteMode } from '@/hooks/useRouletteMatch';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { reportAccountGuard } from '@/lib/reportModerationService';
import { ROULETTE_INTERESTS } from '@/lib/rouletteService';
import { useCallStore } from '@/lib/callStore';
import { QuickSafetyActions } from '@/components/safety/QuickSafetyActions';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Shuffle, ArrowLeft, Zap, MessageCircle, Video, Mic, SkipForward, X, Sparkles, Users, ShieldCheck, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const MODES: { value: RouletteMode; label: string; icon: typeof MessageCircle; description: string }[] = [
  { value: 'text', label: 'Text', icon: MessageCircle, description: 'Start a chat' },
  { value: 'audio', label: 'Audio', icon: Mic, description: 'Share a call' },
  { value: 'video', label: 'Video', icon: Video, description: 'Face to face' },
];
export default function VYBERoulette() {
  const session = useReportAccountSession(), profileId = useAuthProfileId();
  return <RouletteView key={session.uid + ':' + session.epoch + ':' + profileId} />;
}
function RouletteView() {
  const navigate = useNavigate(), ownProfileId = useAuthProfileId(), session = useReportAccountSession();
  const { status, match, error, pendingAction, activeMode, activeInterests, notice, ready, findMatch, cancelSearch, endMatch, skipToNext, retry, handoff } = useRouletteMatch();
  const callStore = useCallStore(), reducedMotion = useReducedMotion();
  const [selectedMode, setSelectedMode] = useState<RouletteMode>('text'), [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [searchTimer, setSearchTimer] = useState(0), [opening, setOpening] = useState(false), [openError, setOpenError] = useState<string | null>(null);
  const openingRef = useRef(false), mounted = useRef(true), guard = reportAccountGuard(session.uid);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (status !== 'searching') { setSearchTimer(0); return; } const timer = setInterval(() => setSearchTimer(value => value + 1), 1000); return () => clearInterval(timer); }, [status]);
  useEffect(() => { setOpenError(null); }, [match?.id]);
  const busy = !!pendingAction || opening;
  const toggleInterest = (interest: string) => setSelectedInterests(values => values.includes(interest) ? values.filter(value => value !== interest) : values.length < 5 ? [...values, interest] : values);
  const openMatch = async () => {
    if (openingRef.current || !match) return;
    const started = match.id;
    try {
      guard(); openingRef.current = true; setOpening(true); setOpenError(null);
      const confirmed = await handoff(); guard();
      if (!mounted.current || !confirmed || confirmed.id !== started || !confirmed.conversation_id) return;
      if (confirmed.mode === 'text' || confirmed.call_starter_profile_id !== ownProfileId) { navigate('/messages/' + confirmed.conversation_id); return; }
      if (callStore.state.phase !== 'idle') throw new Error('Finish your current call before starting another.');
      await callStore.startCall({ callType: confirmed.mode, conversationId: confirmed.conversation_id, receiverId: confirmed.partner.id,
        receiverUsername: confirmed.partner.username, receiverDisplayName: confirmed.partner.display_name, receiverAvatarUrl: confirmed.partner.avatar_url });
      guard();
    } catch (failure) { try { guard(); if (mounted.current) setOpenError(failure instanceof Error ? failure.message : 'Could not open this match. Please retry.'); } catch { /* Retired view. */ } }
    finally { if (mounted.current) { openingRef.current = false; setOpening(false); } }
  };
  const entry = reducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 };
  return <AppLayout>
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8 min-h-[80dvh]">
      <header className="flex items-center gap-3 mb-7">
        <Button variant="ghost" size="icon" className="min-h-11 min-w-11 shrink-0" aria-label="Go back" onClick={() => navigate(-1)}><ArrowLeft aria-hidden="true" className="h-5 w-5" /></Button>
        <div><h1 className="text-2xl font-bold flex items-center gap-2"><Shuffle aria-hidden="true" className="h-6 w-6 text-primary shrink-0" />VYBE Roulette</h1><p className="text-sm text-muted-foreground mt-1">Meet someone who shares your vibe</p></div>
      </header>
      {(error || openError) && <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 mb-5 space-y-3"><p className="text-sm text-destructive">{openError || error}</p>{error && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void retry()}>Retry Roulette</Button>}</div>}
      {notice && <p role="status" className="text-sm text-muted-foreground mb-4">{notice}</p>}
      <AnimatePresence mode="wait" initial={false}>
        {(status === 'idle' || status === 'ended') && <motion.div key="setup" initial={entry} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }} className="space-y-6">
          {status === 'ended' && <p role="status" className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">This session has ended. Find a new vibe when you're ready.</p>}
          <fieldset><legend className="text-sm font-semibold mb-3 text-muted-foreground">Choose your mode</legend><div className="grid grid-cols-3 gap-2">
            {MODES.map(option => { const Icon = option.icon; return <motion.button key={option.value} type="button" aria-pressed={selectedMode === option.value} onClick={() => setSelectedMode(option.value)} whileTap={reducedMotion ? undefined : { scale: 0.97 }}
              className={cn('rounded-2xl px-2 py-4 border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background', selectedMode === option.value ? 'border-primary bg-primary/10' : 'border-border/60 bg-card hover:border-primary/40')}>
              <Icon aria-hidden="true" className={cn('h-6 w-6 mx-auto mb-2', selectedMode === option.value ? 'text-primary' : 'text-muted-foreground')} /><span className="block text-sm font-semibold">{option.label}</span><span className="block text-[11px] text-muted-foreground mt-1">{option.description}</span>
            </motion.button>; })}
          </div></fieldset>
          <fieldset><legend className="text-sm font-semibold mb-3 text-muted-foreground">Your vibes <span className="font-normal">{selectedInterests.length}/5</span></legend><div className="flex flex-wrap gap-2">
            {ROULETTE_INTERESTS.map(interest => { const selected = selectedInterests.includes(interest); return <button key={interest} type="button" aria-pressed={selected} disabled={!selected && selectedInterests.length >= 5} onClick={() => toggleInterest(interest)}
              className={cn('min-h-11 px-4 rounded-full text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40', selected ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:border-primary/50')}>{interest}</button>; })}
          </div><p className="text-xs text-muted-foreground mt-3">Choose up to five, or leave them open to meet someone new.</p></fieldset>
          <div className="flex gap-3 rounded-2xl p-4 border border-border/60 bg-card/60 text-xs text-muted-foreground leading-relaxed"><ShieldCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" /><p>Blocked users are excluded. You can report, skip or end any match. Calls start when you choose to connect.</p></div>
          <Button size="lg" className="w-full rounded-2xl h-14 text-base font-bold gap-2 bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/10" disabled={!ready || busy} onClick={() => void findMatch(selectedMode, selectedInterests)}><Zap aria-hidden="true" className="h-5 w-5" />Find My Vibe Match</Button>
        </motion.div>}
        {status === 'searching' && <motion.div key="searching" initial={entry} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }} className="flex flex-col items-center justify-center min-h-[50dvh] gap-7 py-8">
          <div className="relative h-32 w-32"><motion.div aria-hidden="true" className="absolute inset-0 rounded-full bg-primary/10 border border-primary/25" animate={reducedMotion ? { scale: 1, opacity: 1 } : { scale: [1, 1.22, 1], opacity: [0.8, 0.3, 0.8] }} transition={reducedMotion ? { duration: 0 } : { duration: 2.5, repeat: Infinity }} /><div className="absolute inset-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/15 border border-primary/30 flex items-center justify-center"><Shuffle aria-hidden="true" className="h-10 w-10 text-primary" /></div></div>
          <div className="text-center space-y-2"><h2 role="status" className="text-xl font-bold">{pendingAction === 'join' ? 'Connecting your search…' : pendingAction === 'cancel' ? 'Leaving your search…' : 'Finding your vibe match…'}</h2><p className="text-sm text-muted-foreground">{searchTimer}s · {MODES.find(option => option.value === activeMode)?.label} mode{activeInterests.length > 0 ? ' · ' + activeInterests.length + ' vibes' : ''}</p></div>
          <Button variant="outline" className="rounded-full min-h-11 px-6" disabled={pendingAction === 'cancel'} onClick={() => void cancelSearch()}><X aria-hidden="true" className="h-4 w-4 mr-2" />{pendingAction === 'cancel' ? 'Cancelling…' : 'Cancel search'}</Button>
        </motion.div>}
        {status === 'matched' && match && <motion.div key={match.id} initial={entry} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }} className="flex flex-col items-center min-h-[50dvh] gap-5 pt-3">
          <div className="text-center"><Sparkles aria-hidden="true" className="h-9 w-9 text-primary mx-auto mb-3" /><h2 role="status" className="text-2xl font-bold">It's a Vibe! ✨</h2><p className="text-sm text-muted-foreground mt-2">A new connection, on your terms.</p></div>
          <div className="rounded-3xl p-6 border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-accent/10 w-full max-w-sm text-center shadow-xl shadow-black/5">
            <Avatar className="h-20 w-20 mx-auto mb-4 ring-4 ring-primary/20"><AvatarImage src={match.partner.avatar_url || undefined} /><AvatarFallback className="text-2xl">{match.partner.username[0]?.toUpperCase() || '?'}</AvatarFallback></Avatar>
            <p className="text-lg font-bold break-words">{match.partner.display_name || match.partner.username}</p><p className="text-sm text-muted-foreground mb-4 break-all">@{match.partner.username}</p>
            {match.shared_interests.length > 0 && <div className="flex flex-wrap gap-2 justify-center mb-4">{match.shared_interests.map(interest => <Badge key={interest} variant="secondary" className="rounded-full text-xs px-3 py-1">{interest}</Badge>)}</div>}
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5"><Users aria-hidden="true" className="h-3.5 w-3.5" />{match.shared_interests.length} shared vibes · {match.mode} mode</p>
          </div>
          <div className="flex gap-3 w-full max-w-sm"><Button variant="outline" className="flex-1 rounded-2xl min-h-12 gap-2" disabled={busy} onClick={() => void skipToNext(activeMode, activeInterests)}><SkipForward aria-hidden="true" className="h-4 w-4" />Skip</Button><Button className="flex-1 rounded-2xl min-h-12 gap-2 bg-gradient-to-r from-primary to-accent" disabled={busy || match.mode !== 'text' && (!match.call_starter_profile_id || match.call_starter_profile_id === ownProfileId) && callStore.state.phase !== 'idle'} onClick={() => void openMatch()}>{busy && pendingAction === 'handoff' || opening ? <Loader2 aria-hidden="true" className={cn('h-4 w-4', !reducedMotion && 'animate-spin')} /> : match.mode === 'video' ? <Video aria-hidden="true" className="h-4 w-4" /> : match.mode === 'audio' ? <Mic aria-hidden="true" className="h-4 w-4" /> : <MessageCircle aria-hidden="true" className="h-4 w-4" />}{opening || pendingAction === 'handoff' ? 'Opening…' : match.mode === 'text' || match.call_starter_profile_id && match.call_starter_profile_id !== ownProfileId ? 'Open chat' : match.mode === 'audio' ? 'Start audio call' : 'Start video call'}</Button></div>
          {match.mode !== 'text' && match.call_starter_profile_id && match.call_starter_profile_id !== ownProfileId && <p className="text-xs text-muted-foreground text-center max-w-sm">Your match can start the call. Open chat while you wait.</p>}
          <QuickSafetyActions key={match.id + ':' + match.partner.id} targetUserId={match.partner.id} targetUsername={match.partner.username} />
          <Button variant="ghost" className="min-h-11 rounded-full text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => void endMatch()}>{pendingAction === 'end' ? 'Ending session…' : 'End session'}</Button>
        </motion.div>}
      </AnimatePresence>
    </div>
  </AppLayout>;
}
