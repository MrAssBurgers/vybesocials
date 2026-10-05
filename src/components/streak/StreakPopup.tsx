import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useTheme } from '@/lib/theme';
import type { LoginStreakReceipt } from '@/lib/loginStreakService';

interface StreakPopupProps {
  open: boolean; streak: number; longestStreak: number; isNewStreak?: boolean;
  onClose: () => void; isPremium?: boolean; onRestore?: () => void; isRestoring?: boolean;
  receipt?: LoginStreakReceipt | null; error?: string; onRetry?: () => void; isUpdating?: boolean;
}
export function StreakPopup({ open, streak, longestStreak, onClose, onRestore, isRestoring, receipt, error, onRetry, isUpdating }: StreakPopupProps) {
  const { reducedMotion } = useTheme();
  const focusReturn = useRef<HTMLElement | null>(null);
  const broken = receipt?.streakBroken === true;
  const restored = receipt?.restored === true;
  const restore = receipt?.restore;
  const deadline = restore?.availableUntil ? Date.parse(restore.availableUntil) : null;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    if (deadline === null || deadline <= Date.now()) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(deadline - Date.now() + 5, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [open, deadline]);
  const expired = deadline !== null && deadline <= now;
  const legacy = receipt && receipt.legacyHistory.status !== 'none';
  const title = !receipt && error ? 'Streak unavailable' : restored ? 'Streak restored!' : broken ? 'A new streak started' : `${streak} Day Streak!`;
  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent
        className="max-w-sm border-accent/30 bg-gradient-to-br from-accent/20 via-background to-destructive/20"
        onEscapeKeyDown={onClose}
        onOpenAutoFocus={() => { focusReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={event => { event.preventDefault(); if (focusReturn.current?.isConnected) focusReturn.current.focus(); }}
      >
        <div className="flex flex-col items-center text-center">
          <motion.div aria-hidden className="mb-4 text-7xl" initial={false} animate={reducedMotion ? { scale: 1 } : { scale: [1, 1.08, 1] }} transition={{ duration: 0.8 }}>🔥</motion.div>
          <DialogTitle className="text-2xl font-bold">{title}</DialogTitle>
          <DialogDescription className="mt-2">
            {!receipt ? 'Check your connection and retry to confirm today’s login.' : restored ? 'Your previous run and today’s login are confirmed.' : broken ? 'Today starts a new run. Your best streak is still kept.' : 'Come back tomorrow to keep it going!'}
          </DialogDescription>
          {receipt && <>
            <div className="mt-6 flex gap-6"><div><div className="text-2xl font-bold">{streak}</div><div className="text-xs text-muted-foreground">Current</div></div><div className="w-px bg-border" /><div><div className="text-2xl font-bold">{longestStreak}</div><div className="text-xs text-muted-foreground">Best</div></div></div>
            {restore?.eligible && !expired && onRestore && <div className="mt-4 w-full">
              <p className="mb-2 text-sm">Your previous run was {restore.previousStreak} days. Restore it with today counted once.</p>
              <p className="mb-2 text-xs text-muted-foreground">Restore is available after exactly one missed day, until {deadline === null ? 'the end of today' : new Intl.DateTimeFormat(undefined, { timeZone: receipt.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(deadline)} ({receipt.timezone}).</p>
              <Button onClick={onRestore} disabled={isRestoring || isUpdating} variant="outline" className="w-full gap-2"><RotateCcw className="h-4 w-4" />{isRestoring ? 'Restoring…' : `Restore ${restore.previousStreak}-day run`}</Button>
              <p className="mt-1 text-xs text-muted-foreground">{restore.access === 'launch-free' ? 'Available during launch.' : 'Included with your current access.'}</p>
            </div>}
            {restore?.eligible && expired && <p role="status" className="mt-4 text-sm text-muted-foreground">The restore window has ended. Today’s new streak is kept.</p>}
            {broken && !restore?.eligible && <p className="mt-4 text-sm text-muted-foreground">{restore?.reason === 'legacy-unverified' ? 'Earlier streak history is preserved, but its previous run cannot be verified for a restore.' : restore?.reason === 'premium-required' ? 'Restoring requires eligible access.' : 'This previous run is outside the restore window. Today’s new streak is kept.'}</p>}
            {legacy && <p className="mt-3 text-xs text-muted-foreground">{receipt.legacyHistory.status === 'preserved' ? 'Earlier streak history is kept. Unverified history cannot authorize a restore.' : 'Earlier streak records need review; they have not been replaced.'}</p>}
            <p className="mt-3 text-xs text-muted-foreground">Streak days use {receipt.timezone}.{receipt.timezoneChanged ? ' This stays fixed when your device timezone changes.' : ''}</p>
          </>}
          {error && <div className="mt-4 w-full"><p role="alert" className="text-sm text-destructive">{error}</p>{onRetry && <Button variant="outline" disabled={isUpdating || isRestoring} onClick={onRetry} className="mt-2">{isUpdating ? 'Checking…' : 'Refresh streak'}</Button>}</div>}
          <Button onClick={onClose} className="mt-6 w-full gap-2"><Flame className="h-4 w-4" />{error ? 'Close' : 'Keep It Burning!'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
