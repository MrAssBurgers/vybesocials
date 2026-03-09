import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, Loader2, Wand2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { toast } from 'sonner';
import { getFunctionAuthHeaders } from '@/lib/functionAuth';
import { useHomeLayout } from '@/hooks/useHomeLayout';
import { 
  useGenerateTheme, 
  applyThemeTokens, 
  THEME_PRESETS 
} from '@/hooks/useCustomTheme';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface CommandAction {
  type: 'apply_theme' | 'generate_theme' | 'widget_toggle' | 'widget_reorder';
  preset?: string;
  prompt?: string;
  widget_id?: string;
  visible?: boolean;
  order?: string[];
}

interface CommandResponse {
  message: string;
  actions: CommandAction[];
  error?: string;
}

const EXAMPLE_COMMANDS = [
  "Make my app dark and moody 🌙",
  "Hide the stories bar",
  "Show trending tags first",
  "Give me cyberpunk vibes ⚡",
  "Make everything minimal and clean",
];

export function VYBECommandBar() {
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { layout, toggleWidget, reorderWidgets, applyLayout } = useHomeLayout();
  const generateTheme = useGenerateTheme();
  const { setTheme: setGlobalTheme } = useTheme();

  // Focus input when sheet opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setResponse(null);
    }
  }, [open]);

  const handleOpen = useCallback(() => {
    haptics.tap();
    setOpen(true);
  }, []);

  // Apply actions returned from AI
  const executeActions = useCallback(async (actions: CommandAction[]) => {
    for (const action of actions) {
      switch (action.type) {
        case 'apply_theme': {
          if (action.preset && THEME_PRESETS[action.preset]) {
            const preset = THEME_PRESETS[action.preset];
            const targetMode = preset.mode === 'light' ? 'light' : 'dark';
            setGlobalTheme(targetMode);
            applyThemeTokens(preset);
            toast.success(`Applied ${action.preset} theme! ✨`);
          }
          break;
        }
        case 'generate_theme': {
          if (action.prompt) {
            toast.loading('Generating your custom theme...');
            try {
              await generateTheme.mutateAsync({ prompt: action.prompt, mood: 'balanced' });
              toast.dismiss();
              toast.success('Custom theme generated! 🎨');
            } catch (e) {
              toast.dismiss();
              toast.error('Theme generation failed');
            }
          }
          break;
        }
        case 'widget_toggle': {
          if (action.widget_id) {
            const isCurrentlyHidden = layout.hidden.includes(action.widget_id);
            // Only toggle if state needs to change
            if ((action.visible && isCurrentlyHidden) || (!action.visible && !isCurrentlyHidden)) {
              toggleWidget(action.widget_id);
            }
            toast.success(`Widget ${action.visible ? 'shown' : 'hidden'}!`);
          }
          break;
        }
        case 'widget_reorder': {
          if (action.order && Array.isArray(action.order)) {
            reorderWidgets(action.order);
            toast.success('Home layout updated!');
          }
          break;
        }
      }
    }
  }, [layout.hidden, toggleWidget, reorderWidgets, generateTheme, setGlobalTheme]);

  const handleSubmit = async () => {
    if (!command.trim() || isProcessing) return;

    haptics.tap();
    setIsProcessing(true);
    setResponse(null);

    try {
      const headers = await getFunctionAuthHeaders();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vybe-commander`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            command: command.trim(),
            context: {
              layout: layout.order,
              hidden: layout.hidden,
              currentPreset: 'classic', // TODO: get actual current preset
            },
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to process command');
      }

      const data: CommandResponse = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Show AI response
      setResponse(data.message);

      // Execute actions
      if (data.actions && data.actions.length > 0) {
        await executeActions(data.actions);
      }

      // Clear input after success
      setCommand('');

    } catch (err: any) {
      console.error('VYBE Commander error:', err);
      toast.error(err.message || 'Something went wrong');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setCommand(example.replace(/[🌙⚡🔥✨]/g, '').trim());
    inputRef.current?.focus();
  };

  return (
    <>
      {/* Floating Action Button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={handleOpen}
            className={cn(
              "fixed z-50 w-14 h-14 rounded-2xl shadow-lg",
              "bg-gradient-to-br from-primary via-accent to-primary",
              "flex items-center justify-center",
              "hover:scale-105 active:scale-95 transition-transform",
              "bottom-[calc(5rem+env(safe-area-inset-bottom)+12px)] right-4",
              "lg:bottom-8 lg:right-8"
            )}
            aria-label="Open VYBE AI Commander"
          >
            <Sparkles className="h-6 w-6 text-white" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse border-2 border-background" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Command Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl max-h-[70dvh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-border/50 shrink-0">
            <div className="w-10 h-10 rounded-xl gradient-animated flex items-center justify-center">
              <VybeMiniIcon size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-base">VYBE AI Designer</h3>
              <p className="text-xs text-muted-foreground">Your app, your way — just ask!</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Response Area */}
          <AnimatePresence mode="wait">
            {response && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="py-4 px-3 my-3 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20"
              >
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Zap className="h-3 w-3 text-primary" />
                  </div>
                  <p className="text-sm font-medium">{response}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Example Commands */}
          {!response && (
            <div className="py-3 overflow-x-auto shrink-0">
              <p className="text-xs text-muted-foreground mb-2 px-1">Try saying:</p>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {EXAMPLE_COMMANDS.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => handleExampleClick(ex)}
                    className="shrink-0 px-3 py-1.5 text-xs rounded-full bg-muted/50 hover:bg-muted border border-border/50 hover:border-primary/30 transition-colors whitespace-nowrap"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="mt-auto pt-3 shrink-0">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
                placeholder="Tell me how to redesign your VYBE..."
                className="flex-1"
                disabled={isProcessing}
              />
              <Button
                onClick={handleSubmit}
                disabled={!command.trim() || isProcessing}
                className="shrink-0 gradient-animated text-white"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              YOUR APP YOUR VYBE ✨
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
