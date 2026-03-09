import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useRouletteMatch, RouletteMode } from '@/hooks/useRouletteMatch';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { Shuffle, ArrowLeft, Zap, MessageCircle, Video, Mic, SkipForward, X, Sparkles, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

const INTEREST_OPTIONS = [
  'Music', 'Gaming', 'Art', 'Tech', 'Fashion', 'Sports', 
  'Anime', 'Movies', 'Cooking', 'Travel', 'Fitness', 'Photography',
  'Crypto', 'Comedy', 'Books', 'Nature'
];

const MODE_OPTIONS: { value: RouletteMode; label: string; icon: typeof MessageCircle; desc: string }[] = [
  { value: 'text', label: 'Text', icon: MessageCircle, desc: 'Chat via messages' },
  { value: 'audio', label: 'Audio', icon: Mic, desc: 'Voice only' },
  { value: 'video', label: 'Video', icon: Video, desc: 'Face to face' },
];

export default function VYBERoulette() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { status, match, error, findMatch, cancelSearch, endMatch, skipToNext } = useRouletteMatch();
  const [selectedMode, setSelectedMode] = useState<RouletteMode>('text');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [searchTimer, setSearchTimer] = useState(0);

  // Timer for searching state
  useEffect(() => {
    if (status !== 'searching') {
      setSearchTimer(0);
      return;
    }
    const interval = setInterval(() => setSearchTimer(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev => 
      prev.includes(interest) 
        ? prev.filter(i => i !== interest)
        : prev.length < 5 ? [...prev, interest] : prev
    );
  };

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto px-4 py-4 min-h-[80vh]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shuffle className="h-6 w-6 text-primary" />
              VYBE Roulette
            </h1>
            <p className="text-sm text-muted-foreground">
              Meet someone who shares your vibe
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* IDLE — Setup screen */}
          {status === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Mode selector */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Mode</h3>
                <div className="grid grid-cols-3 gap-2">
                  {MODE_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const isActive = selectedMode === opt.value;
                    return (
                      <motion.button
                        key={opt.value}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedMode(opt.value)}
                        className={cn(
                          "rounded-2xl p-4 text-center border-2 transition-all",
                          isActive 
                            ? "border-primary bg-primary/10" 
                            : "border-border/50 bg-card/50 hover:border-primary/30"
                        )}
                      >
                        <Icon className={cn("h-6 w-6 mx-auto mb-2", isActive ? "text-primary" : "text-muted-foreground")} />
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Interest selector */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
                  Your Vibes <span className="text-xs font-normal">(up to 5)</span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_OPTIONS.map(interest => (
                    <Badge
                      key={interest}
                      variant={selectedInterests.includes(interest) ? 'default' : 'outline'}
                      className={cn(
                        "cursor-pointer transition-all text-xs py-1.5 px-3 rounded-full",
                        selectedInterests.includes(interest) && "bg-primary text-primary-foreground shadow-md"
                      )}
                      onClick={() => toggleInterest(interest)}
                    >
                      {interest}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Safety note */}
              <div className="rounded-2xl p-3 border border-border/50 bg-card/50 text-xs text-muted-foreground">
                <p>🛡️ <strong>Safe vibing:</strong> Blocked users are excluded. You can report or skip any match instantly. Be respectful.</p>
              </div>

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              {/* Start button */}
              <motion.div whileTap={{ scale: 0.97 }}>
                <Button
                  size="lg"
                  className="w-full rounded-2xl h-14 text-lg font-bold gap-2 bg-gradient-to-r from-primary to-accent"
                  onClick={() => findMatch(selectedMode, selectedInterests)}
                >
                  <Zap className="h-5 w-5" />
                  Find My Vibe Match
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* SEARCHING — Animated waiting */}
          {status === 'searching' && (
            <motion.div
              key="searching"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center justify-center min-h-[50vh] gap-6"
            >
              {/* Pulsing animation */}
              <div className="relative">
                <motion.div
                  className="h-32 w-32 rounded-full bg-primary/20 border-2 border-primary/40"
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.6, 0.2, 0.6],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                >
                  <Shuffle className="h-10 w-10 text-primary" />
                </motion.div>
              </div>

              <div className="text-center">
                <h2 className="text-xl font-bold mb-1">Finding your vibe match...</h2>
                <p className="text-sm text-muted-foreground">
                  {searchTimer}s • {selectedMode} mode
                  {selectedInterests.length > 0 && ` • ${selectedInterests.length} vibes`}
                </p>
              </div>

              <Button variant="outline" className="rounded-full" onClick={cancelSearch}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </motion.div>
          )}

          {/* MATCHED — Show partner */}
          {status === 'matched' && match && (
            <motion.div
              key="matched"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="flex flex-col items-center justify-center min-h-[50vh] gap-6"
            >
              {/* Match celebration */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.2 }}
              >
                <Sparkles className="h-10 w-10 text-primary mb-2 mx-auto" />
              </motion.div>

              <motion.h2 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-2xl font-bold text-center"
              >
                It's a Vibe! ✨
              </motion.h2>

              {/* Partner card */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="rounded-3xl p-6 border border-primary/30 bg-gradient-to-br from-primary/10 to-accent/10 w-full max-w-xs text-center"
              >
                <Avatar className="h-20 w-20 mx-auto mb-3 ring-4 ring-primary/30">
                  <AvatarImage src={match.partner?.avatar_url || undefined} />
                  <AvatarFallback className="text-2xl">
                    {match.partner?.username?.[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <p className="text-lg font-bold">
                  {match.partner?.display_name || match.partner?.username || 'Mystery Vibe'}
                </p>
                <p className="text-sm text-muted-foreground mb-3">@{match.partner?.username}</p>

                {match.shared_interests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 justify-center mb-3">
                    {match.shared_interests.map(i => (
                      <Badge key={i} variant="secondary" className="text-[10px] rounded-full">
                        {i}
                      </Badge>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  <Users className="h-3 w-3 inline mr-1" />
                  {match.shared_interests.length} shared vibes
                </p>
              </motion.div>

              {/* Actions */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex gap-3 w-full max-w-xs"
              >
                <Button 
                  variant="outline" 
                  className="flex-1 rounded-2xl gap-1"
                  onClick={() => skipToNext(selectedMode, selectedInterests)}
                >
                  <SkipForward className="h-4 w-4" />
                  Skip
                </Button>
                <Button 
                  className="flex-1 rounded-2xl gap-1 bg-gradient-to-r from-primary to-accent"
                  onClick={() => {
                    if (match.partner?.username) {
                      navigate(`/u/${match.partner.username}`);
                    }
                  }}
                >
                  <MessageCircle className="h-4 w-4" />
                  Say Hi
                </Button>
              </motion.div>

              <Button 
                variant="ghost" 
                size="sm" 
                className="text-destructive"
                onClick={endMatch}
              >
                End Session
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
