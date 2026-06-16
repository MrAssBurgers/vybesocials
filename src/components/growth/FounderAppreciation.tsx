import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { FounderBadge } from '@/components/badges/FounderBadge';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'vybe_founder_appreciation_seen';

export function FounderAppreciation() {
  const { user, profile } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user?.id || !profile?.id) return;
    // Quick local check first
    if (localStorage.getItem(STORAGE_KEY)) return;

    const check = async () => {
      // Check DB flag first
      const { data: profileData } = await db
        .from('profiles')
        .select('founder_badge_seen')
        .eq('id', profile.id)
        .single();

      if ((profileData as any)?.founder_badge_seen) {
        // Already seen on another device — sync locally
        localStorage.setItem(STORAGE_KEY, 'true');
        return;
      }

      // Check if user has the founder badge
      const { data } = await db
        .from('user_badges')
        .select('id')
        .eq('user_id', user.id)
        .eq('badge_id', 'bff8f77e-bfde-4603-be53-7b0d682bbda1')
        .maybeSingle();

      if (data) {
        setShow(true);
      }
    };

    const t = setTimeout(check, 3000);
    return () => clearTimeout(t);
  }, [user?.id, profile?.id]);

  const dismiss = async () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, 'true');

    // Persist to DB so it never shows again on any device
    if (profile?.id) {
      await db
        .from('profiles')
        .update({ founder_badge_seen: true } as any)
        .eq('id', profile.id);
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={dismiss}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-card border border-primary/30 rounded-2xl p-6 text-center space-y-5 shadow-2xl"
          >
            <button
              onClick={dismiss}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="flex justify-center"
            >
              <FounderBadge tier="founder" size="showcase" showTooltip={false} />
            </motion.div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold gradient-text">
                Thank You, Founder 💎
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Thank you for being a part of VYBE in its early phase. As a token of our
                appreciation, you've been granted the exclusive <strong className="text-primary">VYBE Founder</strong> badge
                — permanently attached to your profile.
              </p>
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground">
              This badge is <strong>non-removable</strong>, <strong>limited edition</strong>, and
              will always show next to your name. Only the first 1,000 users will ever have it.
            </div>

            <Button onClick={dismiss} className="w-full gradient-animated gap-2">
              I'm a Founder! 🎉
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
