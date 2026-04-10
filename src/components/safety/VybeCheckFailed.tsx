import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldX, Edit3, MessageSquareWarning, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

interface VybeCheckFailedProps {
  message: string;
  categories?: string[];
  /** Files the user was trying to post */
  files?: File[];
  caption?: string;
  tags?: string[];
  mediaUrls?: string[];
  contentType?: string;
  onEdit: () => void;
  onAppealComplete: () => void;
}

export function VybeCheckFailed({
  message,
  categories = [],
  files,
  caption,
  tags,
  mediaUrls,
  contentType = 'post',
  onEdit,
  onAppealComplete,
}: VybeCheckFailedProps) {
  const { profile } = useAuth();
  const [appealReason, setAppealReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAppealForm, setShowAppealForm] = useState(false);

  const handleAppeal = async () => {
    if (!profile?.id || !appealReason.trim()) {
      toast.error('Please provide a reason for your appeal');
      return;
    }

    setIsSubmitting(true);
    try {
      // Save draft to localStorage for resume later
      const draftKey = `vybe_draft_${Date.now()}`;
      const draftData = { caption, tags, mediaUrls, contentType, timestamp: Date.now() };
      localStorage.setItem(draftKey, JSON.stringify(draftData));

      const { error } = await supabase.from('content_appeals').insert({
        user_id: profile.id,
        content_type: contentType as any,
        reason: appealReason,
        draft_caption: caption || null,
        draft_tags: tags || null,
        draft_media_urls: mediaUrls || null,
        content_category: categories.join(', ') || null,
        scan_reason: message || null,
      });

      if (error) throw error;

      toast.success('Appeal submitted! A moderator will review it and you\'ll get a notification.');
      onAppealComplete();
    } catch (err) {
      console.error('Appeal submit error:', err);
      toast.error('Failed to submit appeal');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-6" style={{ backgroundColor: 'hsl(var(--background) / 0.97)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className="w-full max-w-sm space-y-6"
      >
        {/* Icon */}
        <div className="flex flex-col items-center text-center space-y-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 400 }}
            className="w-20 h-20 rounded-full bg-destructive/15 flex items-center justify-center"
          >
            <ShieldX className="w-10 h-10 text-destructive" />
          </motion.div>

          <div>
            <h2 className="text-xl font-bold text-foreground">Failed Vybe Check</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your content was flagged by our safety system
            </p>
          </div>

          {/* Flagged categories */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {categories.map((cat) => (
                <span key={cat} className="px-3 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                  {cat}
                </span>
              ))}
            </div>
          )}

          <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
        </div>

        {/* Appeal form */}
        {showAppealForm ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-3"
          >
            <Textarea
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              placeholder="Explain why you think this content should be allowed..."
              className="resize-none bg-card border-border"
              rows={3}
            />
            <Button
              onClick={handleAppeal}
              disabled={!appealReason.trim() || isSubmitting}
              className="w-full rounded-xl"
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
              ) : (
                <><MessageSquareWarning className="w-4 h-4 mr-2" /> Submit Appeal</>
              )}
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <Button
              onClick={onEdit}
              variant="default"
              className="w-full rounded-xl py-5"
            >
              <Edit3 className="w-4 h-4 mr-2" /> Edit Post
            </Button>
            <Button
              onClick={() => setShowAppealForm(true)}
              variant="outline"
              className="w-full rounded-xl py-5"
            >
              <MessageSquareWarning className="w-4 h-4 mr-2" /> Appeal to Moderator
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
