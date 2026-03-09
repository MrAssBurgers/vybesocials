import { useState } from 'react';
import { motion } from 'framer-motion';
import { Dna, Sparkles, RefreshCw, Share2, Check, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useVybeDNA, useGenerateVybeDNA } from '@/hooks/useVybeDNA';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DNAOrb } from '@/components/dna/DNAOrb';
import { PersonalityArchetype } from '@/components/dna/PersonalityArchetype';
import { DNATraitBars } from '@/components/dna/DNATraitBars';
import { DNAColorPalette } from '@/components/dna/DNAColorPalette';
import { DNAInsights } from '@/components/dna/DNAInsights';

export default function VybeDNAPage() {
  const navigate = useNavigate();
  const { data: dna, isLoading } = useVybeDNA();
  const generateDNA = useGenerateVybeDNA();
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    generateDNA.mutate(undefined, {
      onSuccess: () => toast.success('Your VYBE DNA has been generated!'),
      onError: () => toast.error('Failed to generate DNA'),
    });
  };

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
    <div className="min-h-screen bg-background pb-24">
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
            <PersonalityArchetype dna={dna} />

            {/* Insights grid */}
            <DNAInsights dna={dna} />

            {/* Trait bars */}
            <DNATraitBars dna={dna} />

            {/* Color palette */}
            <DNAColorPalette dna={dna} />

            {/* Actions */}
            <motion.div
              className="flex gap-3 pt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleGenerate}
                disabled={generateDNA.isPending}
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", generateDNA.isPending && "animate-spin")} />
                Regenerate
              </Button>
              <Button className="flex-1" onClick={handleShare}>
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                Share DNA
              </Button>
            </motion.div>
          </>
        ) : (
          /* Empty state - no DNA yet */
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
                  <Dna className="w-20 h-20 mx-auto text-primary/40" />
                </motion.div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-foreground">Discover Your VYBE DNA</h2>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                    Your DNA is a unique visual identity generated from your activity, social connections, and creative output. No two are alike.
                  </p>
                </div>
                <Button size="lg" onClick={handleGenerate} disabled={generateDNA.isPending} className="px-8">
                  {generateDNA.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Generate My DNA
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
