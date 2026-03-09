import { useState } from 'react';
import { motion } from 'framer-motion';
import { Dna, Sparkles, RefreshCw, Share2, Copy, Check, ArrowLeft, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVybeDNA, useGenerateVybeDNA, VybeDNA } from '@/hooks/useVybeDNA';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function DNAVisualization({ dna }: { dna: VybeDNA }) {
  const { signature_colors, glyph_pattern, aura_intensity } = dna;

  return (
    <div className="relative w-64 h-64 mx-auto">
      {/* Aura rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border-2 opacity-30"
          style={{
            borderColor: signature_colors[i] || signature_colors[0],
            scale: 1 + i * 0.15,
          }}
          animate={{
            rotate: [0, 360],
            scale: [1 + i * 0.15, 1.1 + i * 0.15, 1 + i * 0.15],
          }}
          transition={{
            rotate: { duration: 20 + i * 5, repeat: Infinity, ease: 'linear' },
            scale: { duration: 3 + i, repeat: Infinity, ease: 'easeInOut' },
          }}
        />
      ))}

      {/* Center glyph */}
      <motion.div
        className="absolute inset-8 rounded-full flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${signature_colors[0]}, ${signature_colors[1]}, ${signature_colors[2]})`,
          boxShadow: `0 0 ${40 * aura_intensity}px ${signature_colors[0]}`,
        }}
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Dna className="w-16 h-16 text-white" />
      </motion.div>

      {/* Pattern indicator */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-sm text-muted-foreground">
        Pattern: <span className="font-medium text-foreground capitalize">{glyph_pattern}</span>
      </div>
    </div>
  );
}

function PersonalityBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

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
    
    const shareData = {
      title: 'My VYBE DNA',
      text: `Check out my unique VYBE signature! Colors: ${dna.signature_colors.join(', ')} | Pattern: ${dna.glyph_pattern}`,
    };

    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(shareData.text);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const personality = dna?.personality_vector as { activity?: number; social?: number; creative?: number } | undefined;

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              VYBE DNA
            </h1>
          </div>
          <p className="text-foreground/80 text-sm">
            Your unique visual signature based on your activity and personality
          </p>
        </div>

        {/* What is VYBE DNA */}
        <Card>
          <CardContent className="py-4">
            <div className="flex gap-3 items-start">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Info className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">What is VYBE DNA?</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  VYBE DNA generates a unique visual identity based on how you use the app. Your activity, social interactions, and creative output combine to create a one-of-a-kind color palette, glyph pattern, and aura that evolves over time. Share it with friends or use it to stand out on your profile.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* DNA Visualization */}
        <Card>
          <CardContent className="py-12">
            {isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : dna ? (
              <DNAVisualization dna={dna} />
            ) : (
              <div className="text-center space-y-4">
                <Dna className="w-16 h-16 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground">Generate your unique VYBE DNA</p>
                <Button onClick={handleGenerate} disabled={generateDNA.isPending}>
                  {generateDNA.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Generate DNA
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Personality Breakdown */}
        {dna && personality && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Personality Vector</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PersonalityBar 
                label="Activity" 
                value={personality.activity || 0} 
                color={dna.signature_colors[0]} 
              />
              <PersonalityBar 
                label="Social" 
                value={personality.social || 0} 
                color={dna.signature_colors[1]} 
              />
              <PersonalityBar 
                label="Creative" 
                value={personality.creative || 0} 
                color={dna.signature_colors[2]} 
              />
            </CardContent>
          </Card>
        )}

        {/* Color Palette */}
        {dna && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Signature Colors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {dna.signature_colors.map((color, i) => (
                  <div key={i} className="flex-1 space-y-2">
                    <div 
                      className="h-16 rounded-lg shadow-inner"
                      style={{ backgroundColor: color }}
                    />
                    <p className="text-xs text-center text-muted-foreground font-mono">{color}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        {dna && (
          <div className="flex gap-3">
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
              Share
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
