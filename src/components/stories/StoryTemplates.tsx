import { useState, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BarChart2, HelpCircle, Shuffle, X, ChevronLeft } from 'lucide-react';

export type StoryTemplateType = 'poll' | 'qa' | 'this_or_that';

interface StoryTemplate {
  id: StoryTemplateType;
  label: string;
  icon: any;
  description: string;
}

const TEMPLATES: StoryTemplate[] = [
  { id: 'poll', label: 'Poll', icon: BarChart2, description: 'Ask a question with 2-4 options' },
  { id: 'qa', label: 'Q&A', icon: HelpCircle, description: 'Let friends ask you anything' },
  { id: 'this_or_that', label: 'This or That', icon: Shuffle, description: 'Two choices, pick one' },
];

interface StoryTemplatePickerProps {
  onSelect: (template: StoryTemplateType, data: any) => void;
  onClose: () => void;
}

export const StoryTemplatePicker = memo(function StoryTemplatePicker({ onSelect, onClose }: StoryTemplatePickerProps) {
  const [selected, setSelected] = useState<StoryTemplateType | null>(null);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [qaPrompt, setQaPrompt] = useState('Ask me anything');
  const [totOption1, setTotOption1] = useState('');
  const [totOption2, setTotOption2] = useState('');

  const handleCreate = useCallback(() => {
    if (!selected) return;

    switch (selected) {
      case 'poll':
        if (!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2) return;
        onSelect('poll', { question: pollQuestion, options: pollOptions.filter(o => o.trim()) });
        break;
      case 'qa':
        onSelect('qa', { prompt: qaPrompt });
        break;
      case 'this_or_that':
        if (!totOption1.trim() || !totOption2.trim()) return;
        onSelect('this_or_that', { option1: totOption1, option2: totOption2 });
        break;
    }
  }, [selected, pollQuestion, pollOptions, qaPrompt, totOption1, totOption2, onSelect]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button onClick={selected ? () => setSelected(null) : onClose} className="p-1">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-sm font-bold">
          {selected ? TEMPLATES.find(t => t.id === selected)?.label : 'Interactive Story'}
        </h2>
        <button onClick={onClose} className="p-1">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-20">
        <AnimatePresence mode="wait">
          {!selected ? (
            <motion.div
              key="templates"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3 pt-4"
            >
              <p className="text-xs text-muted-foreground text-center mb-4">
                Add an interactive element to your story
              </p>
              {TEMPLATES.map((template) => (
                <motion.button
                  key={template.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelected(template.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/30 hover:border-primary/30 transition-all text-left"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <template.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{template.label}</p>
                    <p className="text-xs text-muted-foreground">{template.description}</p>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          ) : selected === 'poll' ? (
            <motion.div
              key="poll"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 pt-4"
            >
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Question</label>
                <input
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="What's your favorite...?"
                  maxLength={100}
                  className="w-full px-4 py-3 rounded-xl bg-muted/40 border-0 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Options</label>
                {pollOptions.map((opt, i) => (
                  <input
                    key={i}
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...pollOptions];
                      newOpts[i] = e.target.value;
                      setPollOptions(newOpts);
                    }}
                    placeholder={`Option ${i + 1}`}
                    maxLength={50}
                    className="w-full px-4 py-2.5 rounded-xl bg-muted/40 border-0 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
                  />
                ))}
                {pollOptions.length < 4 && (
                  <button
                    onClick={() => setPollOptions([...pollOptions, ''])}
                    className="text-xs text-primary font-medium"
                  >
                    + Add option
                  </button>
                )}
              </div>
            </motion.div>
          ) : selected === 'qa' ? (
            <motion.div
              key="qa"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 pt-4"
            >
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Prompt</label>
                <input
                  value={qaPrompt}
                  onChange={(e) => setQaPrompt(e.target.value)}
                  placeholder="Ask me anything"
                  maxLength={80}
                  className="w-full px-4 py-3 rounded-xl bg-muted/40 border-0 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
                />
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 p-6 text-center">
                <p className="text-lg font-bold mb-2">{qaPrompt || 'Ask me anything'}</p>
                <div className="w-full h-10 rounded-full bg-background/60 border border-border/30 flex items-center px-4">
                  <span className="text-xs text-muted-foreground">Type a question...</span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="tot"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 pt-4"
            >
              <p className="text-xs text-muted-foreground text-center">Pick two options for your friends to choose between</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground">This</label>
                  <input
                    value={totOption1}
                    onChange={(e) => setTotOption1(e.target.value)}
                    placeholder="Coffee"
                    maxLength={30}
                    className="w-full px-3 py-3 rounded-xl bg-primary/10 border border-primary/20 text-sm text-center font-medium focus:ring-2 focus:ring-primary/30 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground">That</label>
                  <input
                    value={totOption2}
                    onChange={(e) => setTotOption2(e.target.value)}
                    placeholder="Tea"
                    maxLength={30}
                    className="w-full px-3 py-3 rounded-xl bg-accent/10 border border-accent/20 text-sm text-center font-medium focus:ring-2 focus:ring-accent/30 outline-none"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Create button */}
      {selected && (
        <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            onClick={handleCreate}
            className="w-full rounded-full h-11 text-sm font-semibold"
          >
            Add to Story
          </Button>
        </div>
      )}
    </motion.div>
  );
});
