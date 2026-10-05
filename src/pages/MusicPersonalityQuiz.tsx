import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, ArrowRight, Share2, Sparkles, RefreshCcw, ChevronRight, ArrowLeft, Heart, Headphones, Radio, Mic2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { publishMusicPost, saveMusicPersonality } from '@/lib/musicWriteResults';
import { toast } from 'sonner';

const QUIZ_QUESTIONS = [
  {
    question: "What's your ideal Friday night?",
    icon: '🌙',
    options: [
      { text: "Raving at a crowded club", points: { edm: 3, pop: 1 } },
      { text: "Acoustic set at a local cafe", points: { acoustic: 3, indie: 2 } },
      { text: "Late night drive with the windows down", points: { lofi: 3, synthwave: 2 } },
      { text: "Front row at a stadium concert", points: { pop: 3, rock: 2 } }
    ]
  },
  {
    question: "How do you listen to music?",
    icon: '🎧',
    options: [
      { text: "Huge bass-heavy headphones", points: { edm: 2, rock: 2 } },
      { text: "Vinyl records on a vintage player", points: { acoustic: 3, indie: 2 } },
      { text: "Background noise while working", points: { lofi: 3, acoustic: 1 } },
      { text: "Blasting from my car speakers", points: { synthwave: 3, pop: 2 } }
    ]
  },
  {
    question: "Pick a color palette that speaks to you",
    icon: '🎨',
    options: [
      { text: "Neon Pink & Cyan", points: { synthwave: 3, edm: 1 } },
      { text: "Earth Tones (Browns & Greens)", points: { acoustic: 3, indie: 2 } },
      { text: "Pastel Purples & Blues", points: { lofi: 3, pop: 1 } },
      { text: "Black & Silver", points: { rock: 3, edm: 1 } }
    ]
  },
  {
    question: "Your mood playlist is usually...",
    icon: '💿',
    options: [
      { text: "Hype anthems to pump me up", points: { edm: 2, pop: 2, rock: 1 } },
      { text: "Sad songs that hit different at 2am", points: { indie: 3, lofi: 2 } },
      { text: "Smooth vibes for focus & flow", points: { lofi: 3, acoustic: 1 } },
      { text: "Throwback classics from every era", points: { pop: 2, rock: 2, acoustic: 1 } }
    ]
  },
  {
    question: "If you could attend any music festival, which one?",
    icon: '🎪',
    options: [
      { text: "Tomorrowland — massive EDM energy", points: { edm: 3, synthwave: 1 } },
      { text: "Coachella — a mix of everything", points: { pop: 2, indie: 2 } },
      { text: "Glastonbury — underground & eclectic", points: { indie: 3, rock: 1 } },
      { text: "A secret rooftop show at sunset", points: { lofi: 2, acoustic: 2, synthwave: 1 } }
    ]
  },
  {
    question: "What instrument do you wish you could play?",
    icon: '🎸',
    options: [
      { text: "Electric guitar — riffs for days", points: { rock: 3, indie: 1 } },
      { text: "Piano — timeless & emotional", points: { acoustic: 3, lofi: 1 } },
      { text: "Drum machine / Synth — produce beats", points: { edm: 2, synthwave: 2 } },
      { text: "My voice is my instrument", points: { pop: 3, acoustic: 1 } }
    ]
  },
  {
    question: "How do you discover new music?",
    icon: '🔍',
    options: [
      { text: "Algorithm playlists (Discover Weekly, etc.)", points: { pop: 2, edm: 1, lofi: 1 } },
      { text: "Deep-diving Reddit & forums", points: { indie: 3, rock: 1 } },
      { text: "Friends share it with me", points: { pop: 1, acoustic: 1, lofi: 1, indie: 1 } },
      { text: "SoundCloud rabbit holes at 3am", points: { edm: 2, synthwave: 2, lofi: 1 } }
    ]
  },
  {
    question: "What's the most important thing in a song?",
    icon: '🎵',
    options: [
      { text: "The drop / climax moment", points: { edm: 3, rock: 1 } },
      { text: "Meaningful, poetic lyrics", points: { indie: 2, acoustic: 2 } },
      { text: "The overall vibe & atmosphere", points: { lofi: 3, synthwave: 1 } },
      { text: "A catchy hook you can't stop humming", points: { pop: 3, synthwave: 1 } }
    ]
  }
];

const PERSONALITIES: Record<string, {
  title: string;
  description: string;
  gradient: string;
  strengths: string[];
  compatibleWith: string[];
  emoji: string;
}> = {
  edm: {
    title: "The Bass Dropper",
    description: "You thrive on high energy and heavy beats. Your life is a constant festival — you bring the energy to any room and live for the moments when the beat drops.",
    gradient: "from-fuchsia-500 to-cyan-500",
    strengths: ["High energy in social settings", "Natural hype builder", "Loves collaboration"],
    compatibleWith: ["synthwave", "pop"],
    emoji: "🎧",
  },
  acoustic: {
    title: "Acoustic Soul",
    description: "Raw, unplugged, and deeply emotional. You appreciate the authentic sound of real instruments and value genuine connections over flashy performances.",
    gradient: "from-amber-600 to-orange-400",
    strengths: ["Deep emotional intelligence", "Authentic communicator", "Values quality over quantity"],
    compatibleWith: ["indie", "lofi"],
    emoji: "🎸",
  },
  lofi: {
    title: "Chill Lo-Fi Thinker",
    description: "Relaxed and introspective, you find beauty in the quiet moments. Your ideal environment is a rainy day with a warm drink and endless background beats.",
    gradient: "from-indigo-400 to-purple-400",
    strengths: ["Deep focus & flow states", "Calm under pressure", "Thoughtful decision maker"],
    compatibleWith: ["acoustic", "indie"],
    emoji: "☕",
  },
  synthwave: {
    title: "Neon Synthwave Rider",
    description: "You're living in a retro-futuristic movie. Synths, neon lights, and endless highways — your aesthetic is as intentional as your playlist.",
    gradient: "from-pink-500 to-rose-400",
    strengths: ["Visionary thinker", "Trend-aware", "Strong personal brand"],
    compatibleWith: ["edm", "pop"],
    emoji: "🚗",
  },
  pop: {
    title: "Main Character Energy",
    description: "Upbeat, catchy, and always in the spotlight. You know every word to the top 40 and aren't afraid to own the dance floor.",
    gradient: "from-yellow-400 to-orange-500",
    strengths: ["Natural social connector", "Optimistic outlook", "Adaptable to any group"],
    compatibleWith: ["edm", "synthwave"],
    emoji: "✨",
  },
  rock: {
    title: "Rebel Rocker",
    description: "Loud, unapologetic, and full of attitude. You march to the beat of your own drum and value authenticity above everything.",
    gradient: "from-zinc-800 to-stone-600",
    strengths: ["Independent thinker", "Passionate advocate", "Natural leader"],
    compatibleWith: ["indie", "acoustic"],
    emoji: "🎸",
  },
  indie: {
    title: "Indie Explorer",
    description: "You discovered them before they were cool. Your taste is curated, eclectic, and deeply personal — a reflection of who you truly are.",
    gradient: "from-emerald-400 to-teal-500",
    strengths: ["Cultural tastemaker", "Open-minded explorer", "Creative collaborator"],
    compatibleWith: ["acoustic", "lofi"],
    emoji: "🌼",
  }
};

export default function MusicPersonalityQuiz() {
  const account = useProfileAccount();
  const { profile } = account;
  const lifetime = useMemo(() => ({ active: true }), [account.user?.id, account.session.epoch]);
  useEffect(() => { lifetime.active = true; return () => { lifetime.active = false; }; }, [lifetime]);
  const guard = () => { account.guard(); if (!lifetime.active) throw new Error('This quiz closed.'); };
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({
    edm: 0, acoustic: 0, lofi: 0, synthwave: 0, pop: 0, rock: 0, indie: 0
  });
  const [result, setResult] = useState<keyof typeof PERSONALITIES | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleOptionSelect = (points: Record<string, number>) => {
    const newScores = { ...scores };
    Object.entries(points).forEach(([genre, pts]) => {
      newScores[genre] = (newScores[genre] || 0) + pts;
    });
    setScores(newScores);

    if (currentStep < QUIZ_QUESTIONS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      let maxScore = 0;
      let topPersonality: keyof typeof PERSONALITIES = 'pop';
      
      Object.entries(newScores).forEach(([genre, score]) => {
        if (score > maxScore) {
          maxScore = score;
          topPersonality = genre as keyof typeof PERSONALITIES;
        }
      });
      
      setResult(topPersonality);
      void saveResult(topPersonality);
    }
  };

  const saveResult = async (personality: string) => {
    if (!profile) return;
    try { guard(); } catch { return; }
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveMusicPersonality(profile.id, personality); guard();
      toast.success('Music personality saved.');
    } catch (e) {
      try { guard(); } catch { return; }
      const message = e instanceof Error ? e.message : 'Your music result could not be saved. Try again.';
      setSaveError(message);
      toast.error(message);
    } finally {
      try { guard(); setIsSaving(false); } catch { /* Retired view. */ }
    }
  };

  const handleShareToFeed = async () => {
    if (!profile || !result || isSharing) return;
    try { guard(); } catch { return; }
    setIsSharing(true);
    
    try {
      const personality = PERSONALITIES[result];
      
      await publishMusicPost({
        author_id: profile.id,
        type: 'post',
        caption: `${personality.emoji} I just discovered my Music DNA — I'm **${personality.title}**!\n\n"${personality.description}"\n\n🎵 My strengths: ${personality.strengths.join(', ')}\n\nDiscover your sound identity on VYBE! #MusicDNA #VybeQuiz`,
      }, guard);
      guard();
      toast.success('Shared to your feed.');
      navigate('/');
    } catch (error) {
      try { guard(); } catch { return; }
      console.error('Error sharing quiz:', error);
      toast.error('Failed to share results');
    } finally {
      try { guard(); setIsSharing(false); } catch { /* Retired view. */ }
    }
  };

  const resetQuiz = () => {
    setSaveError(null);
    setCurrentStep(0);
    setScores({ edm: 0, acoustic: 0, lofi: 0, synthwave: 0, pop: 0, rock: 0, indie: 0 });
    setResult(null);
  };

  // Get top 3 scores for the breakdown
  const sortedScores = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  const maxPossible = QUIZ_QUESTIONS.length * 3; // max points per genre

  return (
    <AppLayout>
      <div className="container max-w-2xl py-8 flex flex-col min-h-[80vh] justify-center relative">
        {/* Background ambient glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
          <div className="w-[500px] h-[500px] bg-primary/20 rounded-full blur-[100px] opacity-50 animate-pulse" />
        </div>

        {/* Header */}
        <div className="text-center mb-6 relative z-10">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4"
          >
            <Music className="w-8 h-8 text-primary" />
          </motion.div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-2">Find Your Music DNA</h1>
          <p className="text-muted-foreground text-base sm:text-lg">8 questions to discover your true sonic identity.</p>
        </div>

        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div
              key={`step-${currentStep}`}
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative z-10"
            >
              <Card className="border-primary/20 bg-background/50 backdrop-blur-xl">
                <CardContent className="pt-6 pb-6 px-5 sm:px-8">
                  {/* Progress */}
                  <div className="mb-6">
                    <div className="flex justify-between text-sm text-muted-foreground mb-2 font-medium">
                      <span className="flex items-center gap-2">
                        <span className="text-xl">{QUIZ_QUESTIONS[currentStep].icon}</span>
                        Question {currentStep + 1} of {QUIZ_QUESTIONS.length}
                      </span>
                      <span>{Math.round(((currentStep + 1) / QUIZ_QUESTIONS.length) * 100)}%</span>
                    </div>
                    <Progress 
                      value={((currentStep + 1) / QUIZ_QUESTIONS.length) * 100}
                      className="h-2"
                    />
                  </div>

                  <h2 className="text-xl sm:text-2xl font-bold mb-6 text-center leading-tight">
                    {QUIZ_QUESTIONS[currentStep].question}
                  </h2>

                  <div className="grid gap-3">
                    {QUIZ_QUESTIONS[currentStep].options.map((option, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.08 }}
                      >
                        <Button
                          variant="outline"
                          className="w-full h-auto py-4 px-4 text-left justify-between items-center group hover:border-primary hover:bg-primary/5 transition-all text-sm sm:text-base"
                          onClick={() => handleOptionSelect(option.points)}
                        >
                          <span className="flex-1 whitespace-normal">{option.text}</span>
                          <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity text-primary ml-2 flex-shrink-0" />
                        </Button>
                      </motion.div>
                    ))}
                  </div>

                  {/* Back button */}
                  {currentStep > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-4 text-muted-foreground"
                      onClick={() => setCurrentStep(currentStep - 1)}
                    >
                      <ArrowLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", duration: 0.8, bounce: 0.4 }}
              className="relative z-10 space-y-6"
            >
              {/* Result badge */}
              <div className="text-center">
                <Badge variant="secondary" className="px-3 py-1 text-sm bg-primary/20 text-primary border-primary/30">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Your Music DNA Revealed
                </Badge>
              </div>
              
              {/* Main result card */}
              <div className={`p-[2px] rounded-3xl bg-gradient-to-br ${PERSONALITIES[result].gradient} shadow-2xl`}>
                <div className="bg-background rounded-[22px] p-6 sm:p-10 relative overflow-hidden">
                  <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${PERSONALITIES[result].gradient} blur-[60px] opacity-30`} />
                  <div className={`absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-br ${PERSONALITIES[result].gradient} blur-[60px] opacity-30`} />
                  
                  <div className="text-5xl mb-3 text-center">{PERSONALITIES[result].emoji}</div>
                  <h2 className="text-3xl sm:text-4xl font-black mb-3 text-center bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/60">
                    {PERSONALITIES[result].title}
                  </h2>
                  
                  <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed text-center mb-6">
                    {PERSONALITIES[result].description}
                  </p>

                </div>
              </div>

              {/* Strengths */}
              <Card className="border-border/50">
                <CardContent className="p-5">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <Heart className="w-4 h-4" />
                    Your Strengths
                  </h3>
                  <div className="space-y-2">
                    {PERSONALITIES[result].strengths.map((strength, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        {strength}
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Score breakdown */}
              <Card className="border-border/50">
                <CardContent className="p-5">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <Headphones className="w-4 h-4" />
                    Score Breakdown
                  </h3>
                  <div className="space-y-3">
                    {sortedScores.map(([genre, score], i) => (
                      <div key={genre}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium capitalize">{genre}</span>
                          <span className="text-muted-foreground">{Math.round((score / maxPossible) * 100)}%</span>
                        </div>
                        <Progress value={(score / maxPossible) * 100} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Compatibility */}
              <Card className="border-border/50">
                <CardContent className="p-5">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <Radio className="w-4 h-4" />
                    Best Vibe Match
                  </h3>
                  <div className="flex gap-2 flex-wrap">
                    {PERSONALITIES[result].compatibleWith.map(match => (
                      <Badge key={match} variant="secondary" className="text-sm">
                        {PERSONALITIES[match]?.emoji} {PERSONALITIES[match]?.title}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              {isSaving && <p role="status" className="text-center text-sm text-muted-foreground">Saving your music personality…</p>}
              {saveError && <div role="alert" className="text-center space-y-2"><p className="text-sm text-destructive">{saveError}</p><Button variant="outline" disabled={isSaving} onClick={() => void saveResult(result)}>Retry saving result</Button></div>}
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2">
                <Button 
                  size="lg" 
                  className="w-full sm:w-auto h-12 px-8 text-base font-bold rounded-full"
                  onClick={handleShareToFeed}
                  disabled={isSharing}
                >
                  <Share2 className="w-5 h-5 mr-2" />
                  {isSharing ? 'Sharing...' : 'Share to Feed'}
                </Button>
                <Button 
                  variant="ghost" 
                  size="lg"
                  className="w-full sm:w-auto h-12 px-8"
                  onClick={resetQuiz}
                  disabled={isSaving || isSharing}
                >
                  <RefreshCcw className="w-4 h-4 mr-2" />
                  Retake Quiz
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
