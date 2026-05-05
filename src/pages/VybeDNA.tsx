import { useState, memo, Suspense, lazy } from 'react';
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

// Lazy load heavy components that aren't needed for initial paint
const DNASimilarUsers = lazy(() => import('@/components/dna/DNASimilarUsers').then(m => ({ default: m.DNASimilarUsers })));
const DNAChatAssistant = lazy(() => import('@/components/dna/DNAChatAssistant').then(m => ({ default: m.DNAChatAssistant })));

// Simple fade-in section using CSS animation instead of framer-motion whileInView
const FadeInSection = memo(function FadeInSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <div 
      className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both"
      style={{ animationDelay: `${delay}ms`, animationDuration: '400ms' }}
    >
      {children}
    </div>
  );
});

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
    <div className="pb-24 relative min-h-dvh">
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
            {/* DNA Orb - keep single animation for hero */}
            <FadeInSection>
              <div className="pt-4 pb-10">
                <DNAOrb dna={dna} />
              </div>
            </FadeInSection>

            {/* Archetype */}
            <FadeInSection delay={50}>
              <PersonalityArchetype dna={dna} />
            </FadeInSection>

            {/* How it works banner */}
            <FadeInSection delay={100}>
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
            </FadeInSection>

            {/* DNA Perks */}
            <FadeInSection delay={150}>
              <DNAPerks dna={dna} />
            </FadeInSection>

            {/* Insights grid */}
            <FadeInSection delay={200}>
              <DNAInsights dna={dna} />
            </FadeInSection>

            {/* Trait bars */}
            <FadeInSection delay={250}>
              <DNATraitBars dna={dna} />
            </FadeInSection>

            {/* Color palette */}
            <FadeInSection delay={300}>
              <DNAColorPalette dna={dna} />
            </FadeInSection>

            {/* Similar DNA users - lazy loaded */}
            <FadeInSection delay={350}>
              <Suspense fallback={<div className="h-32 flex items-center justify-center"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                <DNASimilarUsers />
              </Suspense>
            </FadeInSection>

            {/* Share action */}
            <FadeInSection delay={400}>
              <Button className="w-full" onClick={handleShare}>
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                Share My DNA
              </Button>
            </FadeInSection>

            {/* DNA Chat Assistant - lazy loaded */}
            <FadeInSection delay={450}>
              <Suspense fallback={null}>
                <DNAChatAssistant dna={dna} />
              </Suspense>
            </FadeInSection>
          </>
        ) : null}
      </div>
    </div>
  );
}
