import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, ArrowRight, Share2, Sparkles, RefreshCcw, ChevronRight } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const QUIZ_QUESTIONS = [
  {
    question: "What's your ideal Friday night?",
    options: [
      { text: "Raving at a crowded club", points: { edm: 3, pop: 1 } },
      { text: "Acoustic set at a local cafe", points: { acoustic: 3, indie: 2 } },
      { text: "Late night drive with the windows down", points: { lofi: 3, synthwave: 2 } },
      { text: "Front row at a stadium concert", points: { pop: 3, rock: 2 } }
    ]
  },
  {
    question: "How do you listen to music?",
    options: [
      { text: "Huge bass-heavy headphones", points: { edm: 2, rock: 2 } },
      { text: "Vinyl records on a vintage player", points: { acoustic: 3, indie: 2 } },
      { text: "Background noise while studying", points: { lofi: 3, acoustic: 1 } },
      { text: "Blasting from my car speakers", points: { synthwave: 3, pop: 2 } }
    ]
  },
  {
    question: "Pick a color palette",
    options: [
      { text: "Neon Pink & Cyan", points: { synthwave: 3, edm: 1 } },
      { text: "Earth Tones (Browns & Greens)", points: { acoustic: 3, indie: 2 } },
      { text: "Pastel Purples & Blues", points: { lofi: 3, pop: 1 } },
      { text: "Black & Silver", points: { rock: 3, edm: 1 } }
    ]
  }
];

const PERSONALITIES = {
  edm: {
    title: "The Bass Dropper 🎧",
    description: "You thrive on high energy and heavy beats. Your life is a party, and you're the DJ.",
    gradient: "from-fuchsia-500 to-cyan-500"
  },
  acoustic: {
    title: "Acoustic Soul 🎸",
    description: "Raw, unplugged, and emotional. You appreciate the authentic sound of real instruments.",
    gradient: "from-amber-600 to-orange-400"
  },
  lofi: {
    title: "Chill Lo-Fi Thinker ☕",
    description: "Relaxed and introspective. Your vibe is perfect for rainy days and late-night study sessions.",
    gradient: "from-indigo-400 to-purple-400"
  },
  synthwave: {
    title: "Neon Synthwave Rider 🚗",
    description: "You're living in a retro-futuristic movie. Synths, neon lights, and endless highways.",
    gradient: "from-pink-500 to-rose-400"
  },
  pop: {
    title: "Main Character Energy ✨",
    description: "Upbeat, catchy, and always in the spotlight. You know every word to the top 40 hits.",
    gradient: "from-yellow-400 to-orange-500"
  },
  rock: {
    title: "Rebel Rocker 🎸",
    description: "Loud, unapologetic, and full of attitude. You march to the beat of your own drum.",
    gradient: "from-zinc-800 to-stone-600"
  },
  indie: {
    title: "Indie Explorer 🌼",
    description: "You discovered them before they were cool. You love finding hidden gems and underground artists.",
    gradient: "from-emerald-400 to-teal-500"
  }
};

export default function MusicPersonalityQuiz() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({
    edm: 0, acoustic: 0, lofi: 0, synthwave: 0, pop: 0, rock: 0, indie: 0
  });
  const [result, setResult] = useState<keyof typeof PERSONALITIES | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const handleOptionSelect = (points: Record<string, number>) => {
    // Add points
    const newScores = { ...scores };
    Object.entries(points).forEach(([genre, pts]) => {
      newScores[genre] = (newScores[genre] || 0) + pts;
    });
    setScores(newScores);

    // Next step or calculate result
    if (currentStep < QUIZ_QUESTIONS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Find top score
      let maxScore = 0;
      let topPersonality: keyof typeof PERSONALITIES = 'pop';
      
      Object.entries(newScores).forEach(([genre, score]) => {
        if (score > maxScore) {
          maxScore = score;
          topPersonality = genre as keyof typeof PERSONALITIES;
        }
      });
      
      setResult(topPersonality);
      awardQuizCompletionXP();
    }
  };

  const awardQuizCompletionXP = async () => {
    if (!profile) return;
    try {
      await supabase.rpc('add_user_xp', {
        p_user_id: profile.id,
        p_xp_amount: 100
      });
      toast.success('Quiz completed! +100 XP 🎉');
    } catch (e) {
      console.error('Failed to award XP', e);
    }
  };

  const handleShareToFeed = async () => {
    if (!profile || !result) return;
    setIsSharing(true);
    
    try {
      const personality = PERSONALITIES[result];
      
      const { error } = await supabase.from('posts').insert({
        author_id: profile.id,
        type: 'text',
        caption: `I just took the Music Personality Quiz and I'm a **${personality.title}**! 🎵\n\n"${personality.description}"\n\nTake the quiz to find your vibe! #MusicVibe #VybeQuiz`,
      });

      if (error) throw error;
      
      // Award additional XP for sharing
      await supabase.rpc('add_user_xp', {
        p_user_id: profile.id,
        p_xp_amount: 50
      });

      toast.success('Shared to your feed! +50 XP 🚀');
      setTimeout(() => navigate('/'), 1500);
    } catch (error) {
      console.error('Error sharing quiz:', error);
      toast.error('Failed to share results');
    } finally {
      setIsSharing(false);
    }
  };

  const resetQuiz = () => {
    setCurrentStep(0);
    setScores({ edm: 0, acoustic: 0, lofi: 0, synthwave: 0, pop: 0, rock: 0, indie: 0 });
    setResult(null);
  };

  return (
    <AppLayout>
      <div className="container max-w-2xl py-12 flex flex-col min-h-[80vh] justify-center relative">
        {/* Background ambient glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
          <div className="w-[500px] h-[500px] bg-primary/20 rounded-full blur-[100px] opacity-50 animate-pulse" />
        </div>

        <div className="text-center mb-8 relative z-10">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4"
          >
            <Music className="w-8 h-8 text-primary" />
          </motion.div>
          <h1 className="text-4xl font-black tracking-tight mb-2">Find Your Music Vibe</h1>
          <p className="text-muted-foreground text-lg">Take the quiz to discover your true sonic personality.</p>
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
                <CardContent className="pt-8 pb-8 px-6 sm:px-10">
                  <div className="mb-8">
                    <div className="flex justify-between text-sm text-muted-foreground mb-2 font-medium">
                      <span>Question {currentStep + 1} of {QUIZ_QUESTIONS.length}</span>
                      <span>{Math.round(((currentStep + 1) / QUIZ_QUESTIONS.length) * 100)}%</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-primary"
                        initial={{ width: `${(currentStep / QUIZ_QUESTIONS.length) * 100}%` }}
                        animate={{ width: `${((currentStep + 1) / QUIZ_QUESTIONS.length) * 100}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                      />
                    </div>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center leading-tight">
                    {QUIZ_QUESTIONS[currentStep].question}
                  </h2>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {QUIZ_QUESTIONS[currentStep].options.map((option, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        className="h-auto py-6 text-left justify-start items-center group hover:border-primary hover:bg-primary/5 transition-all text-sm sm:text-base"
                        onClick={() => handleOptionSelect(option.points)}
                      >
                        <span className="flex-1 whitespace-normal">{option.text}</span>
                        <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity text-primary ml-2 flex-shrink-0" />
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", duration: 0.8, bounce: 0.4 }}
              className="relative z-10 text-center"
            >
              <div className="mb-6 inline-block">
                <Badge variant="secondary" className="px-3 py-1 text-sm bg-primary/20 text-primary border-primary/30">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Quiz Complete
                </Badge>
              </div>
              
              <div className={`p-[2px] rounded-3xl bg-gradient-to-br ${PERSONALITIES[result].gradient} mb-8 shadow-2xl`}>
                <div className="bg-background rounded-[22px] p-8 sm:p-12 relative overflow-hidden">
                  <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${PERSONALITIES[result].gradient} blur-[60px] opacity-30`} />
                  <div className={`absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-br ${PERSONALITIES[result].gradient} blur-[60px] opacity-30`} />
                  
                  <h2 className="text-4xl sm:text-5xl font-black mb-4 bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/60">
                    {PERSONALITIES[result].title}
                  </h2>
                  
                  <p className="text-xl text-muted-foreground max-w-md mx-auto leading-relaxed">
                    {PERSONALITIES[result].description}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Button 
                  size="lg" 
                  className="w-full sm:w-auto h-14 px-8 text-lg font-bold rounded-full"
                  onClick={handleShareToFeed}
                  disabled={isSharing}
                >
                  <Share2 className="w-5 h-5 mr-2" />
                  {isSharing ? 'Sharing...' : 'Share to Feed (+50 XP)'}
                </Button>
                <Button 
                  variant="ghost" 
                  size="lg"
                  className="w-full sm:w-auto h-14 px-8"
                  onClick={resetQuiz}
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

// Just missing a ChevronRight import, I'll add it now.
