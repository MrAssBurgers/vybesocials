import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, MessageCircleQuestion, X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

export interface PollData {
  type: 'poll' | 'question';
  question: string;
  options: string[]; // For polls: 2-4 options. For questions: empty array (free-form response)
}

interface StoryPollEditorProps {
  onSave: (data: PollData) => void;
  onCancel: () => void;
  initial?: PollData | null;
}

export function StoryPollEditor({ onSave, onCancel, initial }: StoryPollEditorProps) {
  const [type, setType] = useState<'poll' | 'question'>(initial?.type || 'poll');
  const [question, setQuestion] = useState(initial?.question || '');
  const [options, setOptions] = useState<string[]>(initial?.options?.length ? initial.options : ['', '']);

  const addOption = () => {
    if (options.length < 4) {
      triggerHaptic('light');
      setOptions([...options, '']);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      triggerHaptic('light');
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const canSave = question.trim().length > 0 && (type === 'question' || options.every(o => o.trim().length > 0));

  const handleSave = () => {
    triggerHaptic('medium');
    onSave({
      type,
      question: question.trim(),
      options: type === 'poll' ? options.map(o => o.trim()) : [],
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="bg-card/95 backdrop-blur-lg rounded-2xl border border-border/50 p-4 space-y-4 shadow-xl"
    >
      {/* Type Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => { setType('poll'); triggerHaptic('light'); }}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all",
            type === 'poll' ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground"
          )}
        >
          <BarChart3 className="h-4 w-4" />
          Poll
        </button>
        <button
          onClick={() => { setType('question'); triggerHaptic('light'); }}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all",
            type === 'question' ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground"
          )}
        >
          <MessageCircleQuestion className="h-4 w-4" />
          Question
        </button>
      </div>

      {/* Question Input */}
      <Input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={type === 'poll' ? "Ask a question..." : "Ask me anything..."}
        maxLength={100}
        className="bg-muted/30 border-border/40 text-sm"
      />

      {/* Poll Options */}
      {type === 'poll' && (
        <div className="space-y-2">
          <AnimatePresence>
            {options.map((option, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2"
              >
                <div className="h-6 w-6 rounded-full border-2 border-border/50 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                  {String.fromCharCode(65 + i)}
                </div>
                <Input
                  value={option}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={30}
                  className="flex-1 h-9 bg-muted/20 border-border/30 text-sm"
                />
                {options.length > 2 && (
                  <button onClick={() => removeOption(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {options.length < 4 && (
            <button
              onClick={addOption}
              className="flex items-center gap-2 text-xs text-primary font-medium hover:text-primary/80 transition-colors py-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Add option
            </button>
          )}
        </div>
      )}

      {type === 'question' && (
        <p className="text-xs text-muted-foreground text-center">
          Viewers can type their answers. You'll see all responses.
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave} className="flex-1 gap-1">
          Add to Story
        </Button>
      </div>
    </motion.div>
  );
}
