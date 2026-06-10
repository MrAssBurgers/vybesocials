import { useState, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { MessageSquareHeart, ChevronRight, BookOpen, MessageCircle, ExternalLink, Shield, FileText, Play, Download, Star } from 'lucide-react';
import { openRateApp } from '@/lib/rateApp';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';

import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { InstallAppSheet } from './InstallAppSheet';

const MobileIntro = lazy(() => import('@/pages/MobileIntro'));

export function HelpSection() {
  const [showInstallSheet, setShowInstallSheet] = useState(false);
  const [showIntroReplay, setShowIntroReplay] = useState(false);
  return (
    <div className="space-y-6">
      {showIntroReplay && (
        <Suspense fallback={null}>
          <MobileIntro onDone={() => setShowIntroReplay(false)} />
        </Suspense>
      )}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 ring-1 ring-primary/20 shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.4)] flex items-center justify-center flex-shrink-0">
            <MessageSquareHeart className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">Help & Support</h3>
            <p className="text-sm text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              Get help with VYBE or share your feedback
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Tutorial Button */}
          <button
            onClick={() => {
              haptics.tap();
              const event = new CustomEvent('open-tutorial');
              window.dispatchEvent(event);
            }}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-all active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
              <VybeMiniIcon size={20} showSparkles className="text-white" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="font-medium">Interactive Tutorial</p>
              <p className="text-sm text-muted-foreground">Learn how to use VYBE</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          </button>

          {/* Replay Walkthrough */}
          <button
            onClick={() => {
              haptics.tap();
              try { localStorage.removeItem('vybe_intro_seen'); } catch {}
              setShowIntroReplay(true);
            }}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-all active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
              <Play className="w-5 h-5 text-secondary-foreground" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="font-medium">Replay walkthrough</p>
              <p className="text-sm text-muted-foreground">Watch the VYBE intro again</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          </button>

          {/* Feedback Hub */}
          <Link to="/feedback" className="block">
            <div className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-all active:scale-[0.98]">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-secondary-foreground" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-medium">Feedback Hub</p>
                <p className="text-sm text-muted-foreground">Share ideas & report issues</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            </div>
          </Link>

          {/* Install Web App */}
          <button
            onClick={() => {
              haptics.tap();
              setShowInstallSheet(true);
            }}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-all active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
              <Download className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="font-medium">Install Web App</p>
              <p className="text-sm text-muted-foreground">Add VYBE to your home screen</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          </button>

          {/* Rate VYBE */}
          <button
            onClick={() => {
              haptics.tap();
              openRateApp();
              toast.success('Thanks for supporting VYBE! ⭐');
            }}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 hover:from-amber-500/15 hover:to-orange-500/10 transition-all active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/30">
              <Star className="w-5 h-5 text-white fill-white" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="font-medium">Rate VYBE</p>
              <p className="text-sm text-muted-foreground">Love the app? Leave us a review</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          </button>

          {/* Apply for Moderator */}
          <Link to="/apply-moderator" className="block">
            <div className="w-full flex items-center gap-4 p-4 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all active:scale-[0.98]">
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-medium">Apply for Moderator</p>
                <p className="text-sm text-muted-foreground">Help keep VYBE safe</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            </div>
          </Link>
        </div>
      </motion.div>

      <InstallAppSheet open={showInstallSheet} onOpenChange={setShowInstallSheet} />

      {/* Legal Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <h4 className="font-medium mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          Legal
        </h4>
        
        <div className="space-y-3">
          <Link to="/privacy" className="block">
            <div className="w-full flex items-center gap-4 p-3 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-all active:scale-[0.98]">
              <Shield className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1 text-left">
                <p className="font-medium text-sm">Privacy Policy</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </Link>
          
          <Link to="/terms" className="block">
            <div className="w-full flex items-center gap-4 p-3 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-all active:scale-[0.98]">
              <FileText className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1 text-left">
                <p className="font-medium text-sm">Terms of Service</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </Link>

          <Link to="/child-safety" className="block">
            <div className="w-full flex items-center gap-4 p-3 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-all active:scale-[0.98]">
              <Shield className="w-5 h-5 text-rose-500" />
              <div className="flex-1 text-left">
                <p className="font-medium text-sm">Child Safety Standards</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </Link>
        </div>
      </motion.div>

      {/* FAQ Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <h4 className="font-medium mb-4 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
          Quick Help
        </h4>
        
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="font-medium text-sm mb-1">How do I change my profile picture?</p>
            <p className="text-xs text-muted-foreground">
              Go to your profile and tap on your avatar to upload a new photo.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="font-medium text-sm mb-1">How do I make my account private?</p>
            <p className="text-xs text-muted-foreground">
              Head to Settings → Privacy and toggle the Private Account switch.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="font-medium text-sm mb-1">How do I customize my theme?</p>
            <p className="text-xs text-muted-foreground">
              Go to Settings → Themes to create or browse custom themes.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Contact Info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="liquid-glass-card p-4 sm:p-6 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20"
      >
        <p className="text-sm">
          <strong>Need more help?</strong> We're here for you! Use the Feedback Hub to reach out and we'll get back to you as soon as possible.
        </p>
      </motion.div>
    </div>
  );
}
