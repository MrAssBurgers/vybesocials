import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

export default function CommunityGuidelines() {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchGuidelines() {
      try {
        const { data } = await supabase
          .from('community_guidelines')
          .select('content')
          .eq('is_current', true)
          .single();
        
        if (data) {
          setContent(data.content);
        }
      } catch (error) {
        console.error('Failed to fetch guidelines:', error);
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
          <Link to="/settings">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Settings
            </Button>
          </Link>
          
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
