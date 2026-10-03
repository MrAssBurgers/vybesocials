import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';
import { usePageMeta } from '@/hooks/usePageMeta';

const FALLBACK_GUIDELINES = `# Be a person, not a problem
VYBE is for real connection. Treat people the way you want to be treated in a room full of friends.

## What's welcome
- Original posts, clips, stories, and conversations
- Disagreement that stays respectful
- Sharing events, music, and places you actually care about

## What's not
- Harassment, hate, threats, or bullying
- Sexual content involving anyone under 18
- Spam, scams, impersonation, or non-consensual intimate images
- Anything that puts someone's safety at risk

## How moderation works
Vybe Check scans uploads before they go live. People can report posts, messages, and profiles. Repeated violations can limit features or close an account.

## Your move
If something feels wrong, report it. If we get a call wrong, you can appeal from the notice in the app.`;

export default function CommunityGuidelines() {
  const navigate = useNavigate();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  usePageMeta({
    title: 'Community Guidelines | VYBE',
    description: 'The rules of the road on VYBE: what\'s welcome, what\'s not, and how moderation works to keep the community safe and kind.',
    canonicalPath: '/guidelines',
  });
  
  useEffect(() => {
    async function fetchGuidelines() {
      try {
        const { data } = await db
          .from('community_guidelines')
          .select('content')
          .eq('is_current', true)
          .single();
        
        setContent(data?.content?.trim() ? data.content : FALLBACK_GUIDELINES);
      } catch (error) {
        console.error('Failed to fetch guidelines:', error);
        setContent(FALLBACK_GUIDELINES);
      } finally {
        setLoading(false);
      }
    }
    
    fetchGuidelines();
  }, []);
  
  // Simple markdown-like rendering
  const renderContent = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('# ')) {
        return <h1 key={i} className="text-2xl font-bold mt-6 mb-4 text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{line.slice(2)}</h1>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={i} className="text-xl font-semibold mt-6 mb-3 text-foreground drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">{line.slice(3)}</h2>;
      }
      if (line.startsWith('- ')) {
        return (
          <li key={i} className="ml-4 mb-2 text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
            {line.slice(2)}
          </li>
        );
      }
      if (line.trim() === '') {
        return <div key={i} className="h-2" />;
      }
      return <p key={i} className="text-foreground/80 mb-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{line}</p>;
    });
  };
  
  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl gradient-animated">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">Community Guidelines</h1>
              <p className="text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                Rules to keep VYBE safe and fun for everyone
              </p>
            </div>
          </div>
        </motion.div>
        
        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="liquid-glass-card rounded-2xl p-6"
        >
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-6 w-1/2 mt-4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ) : (
            <div className="prose prose-invert max-w-none">
              {renderContent(content)}
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
}
