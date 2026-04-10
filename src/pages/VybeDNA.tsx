import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Share2, Check, ArrowLeft, RefreshCw, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useVybeDNA } from '@/hooks/useVybeDNA';
import { toast } from 'sonner';
import { DNAOrb } from '@/components/dna/DNAOrb';
import { PersonalityArchetype } from '@/components/dna/PersonalityArchetype';
import { DNATraitBars } from '@/components/dna/DNATraitBars';
import { DNAColorPalette } from '@/components/dna/DNAColorPalette';
import { DNAInsights } from '@/components/dna/DNAInsights';
import { DNAPerks } from '@/components/dna/DNAPerks';
import { DNASimilarUsers } from '@/components/dna/DNASimilarUsers';
import { DNAChatAssistant } from '@/components/dna/DNAChatAssistant';

const stagger = {
  initial: { opacity: 0, y: 20 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true, margin: '-40px' as any },
  transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
};

export default function VybeDNAPage() {
  const navigate = useNavigate();
  const { data: dna, isLoading } = useVybeDNA();
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (!dna) return;
    const pv = dna.personality_vector as Record<string, number>;
    const shareText = `🧬 My VYBE DNA\n⚡ Activity: ${Math.round((pv.activity ?? 0) * 100)}%\n💬 Social: ${Math.round((pv.social ?? 0) * 100)}%\n🎨 Creative: ${Math.round((pv.creative ?? 0) * 100)}%\nPattern: ${dna.glyph_pattern}\n\nDiscover yours on VYBE!`;

    if (navigator.share) {
      await navigator.share({ title: 'My VYBE DNA', text: shareText });
    } else {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="pb-24 relative" style={{ minHeight: 'calc(100dvh + 200px)' }}>
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border/30 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              VYBE DNA
            </h1>
            <p className="text-xs text-muted-foreground">Evolves with your activity</p>
          </div>
          {dna && (
            <Button variant="ghost" size="icon" onClick={handleShare}>
              {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : dna ? (
          <>
            {/* DNA Orb */}
            <motion.div
              className="pt-4 pb-10"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <DNAOrb dna={dna} />
            </motion.div>

            {/* Archetype */}
            <motion.div {...stagger}>
              <PersonalityArchetype dna={dna} />
            </motion.div>

            {/* How it works banner */}
            <motion.div {...stagger}>
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="py-3 px-4 flex items-start gap-3">
                  <Activity className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your DNA evolves automatically based on how you use VYBE — posts you create, 
                    messages you send, people you interact with, and your login streaks all shape 
                    your unique identity. Keep using the app to watch it grow.
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            {/* DNA Perks */}
            <motion.div {...stagger}>
              <DNAPerks dna={dna} />
            </motion.div>

            {/* Insights grid */}
            <motion.div {...stagger}>
              <DNAInsights dna={dna} />
            </motion.div>

            {/* Trait bars */}
            <motion.div {...stagger}>
              <DNATraitBars dna={dna} />
            </motion.div>

            {/* Color palette */}
            <motion.div {...stagger}>
              <DNAColorPalette dna={dna} />
            </motion.div>

            {/* Similar DNA users */}
            <motion.div {...stagger}>
              <DNASimilarUsers />
            </motion.div>

            {/* Share action */}
            <motion.div {...stagger} className="pt-2">
              <Button className="w-full" onClick={handleShare}>
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                Share My DNA
              </Button>
            </motion.div>

            {/* DNA Chat Assistant */}
            <motion.div {...stagger}>
              <DNAChatAssistant dna={dna} />
            </motion.div>
          </>
        ) : (
          /* Empty state — DNA hasn't computed yet (new user with no activity) */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-border/50">
              <CardContent className="py-16 text-center space-y-6">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <Sparkles className="w-20 h-20 mx-auto text-primary/40" />
                </motion.div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-foreground">Your DNA Is Forming</h2>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                    Start posting, messaging, and interacting on VYBE. Your DNA will 
                    automatically generate once we have enough data about your unique style.
                  </p>
                </div>
                <Button variant="outline" onClick={() => navigate('/')}>
                  Go Explore VYBE
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
