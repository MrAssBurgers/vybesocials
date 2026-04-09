import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { PollData } from './StoryPollEditor';

interface StoryPollViewerProps {
  storyId: string;
  pollData: PollData;
  isOwner: boolean;
}

export function StoryPollViewer({ storyId, pollData, isOwner }: StoryPollViewerProps) {
  const { user } = useAuth();
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [voteCounts, setVoteCounts] = useState<number[]>(pollData.options.map(() => 0));
  const [totalVotes, setTotalVotes] = useState(0);
  const [questionAnswer, setQuestionAnswer] = useState('');
  const [answerSubmitted, setAnswerSubmitted] = useState(false);

  const handleVote = useCallback(async (optionIndex: number) => {
    if (!user || hasVoted) return;
    
    triggerHaptic('medium');
    setSelectedOption(optionIndex);
    setHasVoted(true);

    // Optimistic update
    const newCounts = [...voteCounts];
    newCounts[optionIndex]++;
    setVoteCounts(newCounts);
    setTotalVotes(prev => prev + 1);

    try {
      await supabase.from('story_poll_votes').insert({
        story_id: storyId,
        user_id: user.id,
        option_index: optionIndex,
      });
    } catch (err) {
      console.error('Vote error:', err);
    }
  }, [user, hasVoted, voteCounts, storyId]);

  const handleQuestionSubmit = useCallback(async () => {
    if (!user || !questionAnswer.trim()) return;
    triggerHaptic('medium');
    setAnswerSubmitted(true);
    toast.success('Answer sent!');
  }, [user, questionAnswer]);

  if (pollData.type === 'question') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-black/60 backdrop-blur-md rounded-2xl p-4 mx-4 space-y-3"
      >
        <p className="text-white font-semibold text-center text-sm">{pollData.question}</p>
        
        {answerSubmitted ? (
          <p className="text-white/70 text-center text-xs">Thanks for your answer! ✨</p>
        ) : (
          <div className="flex gap-2">
            <input
              value={questionAnswer}
              onChange={(e) => setQuestionAnswer(e.target.value)}
              placeholder="Type your answer..."
              maxLength={100}
              className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-2 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40"
            />
            <button
              onClick={handleQuestionSubmit}
              disabled={!questionAnswer.trim()}
              className="px-4 py-2 bg-primary rounded-full text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              Send
            </button>
          </div>
        )}
      </motion.div>
    );
  }

  // Poll view
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black/60 backdrop-blur-md rounded-2xl p-4 mx-4 space-y-3"
    >
      <p className="text-white font-semibold text-center text-sm">{pollData.question}</p>

      <div className="space-y-2">
        {pollData.options.map((option, i) => {
          const count = voteCounts[i];
          const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isSelected = selectedOption === i;

          return (
            <motion.button
              key={i}
              onClick={() => handleVote(i)}
              disabled={hasVoted}
              whileTap={!hasVoted ? { scale: 0.97 } : undefined}
              className={cn(
                "relative w-full text-left rounded-xl overflow-hidden transition-all",
                hasVoted ? "cursor-default" : "cursor-pointer active:scale-[0.98]"
              )}
            >
              {/* Background bar */}
              <div className="relative z-10 flex items-center justify-between px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl">
                {hasVoted && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-xl",
                      isSelected ? "bg-primary/40" : "bg-white/10"
                    )}
                  />
                )}
                <span className={cn(
                  "relative z-10 text-sm font-medium",
                  isSelected ? "text-primary-foreground" : "text-white"
                )}>
                  {option}
                </span>
                {hasVoted && (
                  <span className="relative z-10 text-xs text-white/70 font-semibold">
                    {percentage}%
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {hasVoted && (
        <p className="text-center text-white/50 text-[10px]">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
      )}
    </motion.div>
  );
}
