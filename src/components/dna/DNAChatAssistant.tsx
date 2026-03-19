import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, X, Sparkles, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import type { VybeDNA } from '@/hooks/useVybeDNA';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  preferencesUpdated?: boolean;
}

const SUGGESTIONS = [
  "Show me more music content 🎵",
  "Less politics, more art 🎨",
  "I want to discover new creators",
  "What does my DNA say about me?",
];

export function DNAChatAssistant({ dna }: { dna: VybeDNA }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || !user) return;

    const userMsg: Message = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dna-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to get response');
      }

      const data = await res.json();
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.message,
        preferencesUpdated: data.preferences_updated,
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (data.preferences_updated) {
        toast.success('Your feed preferences updated! 🧬');
      }
    } catch (e: any) {
      toast.error(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const pv = dna.personality_vector as Record<string, number>;

  return (
    <>
      {/* Floating trigger */}
      <motion.div
        className="fixed bottom-24 right-4 z-40"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5, type: 'spring' }}
      >
        <Button
          onClick={() => setOpen(true)}
          className="h-14 w-14 rounded-full shadow-lg gradient-animated"
          size="icon"
        >
          <MessageCircle className="h-6 w-6 text-white" />
        </Button>
      </motion.div>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col bg-background"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-border/30 bg-background/80 backdrop-blur-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-sm">Your VYBE DNA</h2>
                <p className="text-xs text-muted-foreground">
                  ⚡{Math.round((pv.activity || 0) * 100)}% · 💬{Math.round((pv.social || 0) * 100)}% · 🎨{Math.round((pv.creative || 0) * 100)}%
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && (
                <div className="space-y-4 pt-8">
                  <div className="text-center space-y-2">
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Sparkles className="h-12 w-12 mx-auto text-primary/60" />
                    </motion.div>
                    <p className="text-sm font-semibold">Talk to your DNA</p>
                    <p className="text-xs text-muted-foreground max-w-[250px] mx-auto">
                      Tell me what you want to see more or less of. I'll tune your feed in real time.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="p-3 rounded-xl border border-border/50 bg-card hover:border-primary/40 transition-colors text-left"
                      >
                        <p className="text-xs leading-snug">{s}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2.5',
                    msg.role === 'user'
                      ? 'ml-auto bg-primary text-primary-foreground'
                      : 'bg-muted/60'
                  )}
                >
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                  {msg.preferencesUpdated && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <Zap className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-semibold text-primary">Feed updated</span>
                    </div>
                  )}
                </motion.div>
              ))}

              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-muted-foreground"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                  <span className="text-xs">Tuning your VYBE...</span>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <div className="shrink-0 px-4 py-3 border-t border-border/30 bg-background/80 backdrop-blur-xl">
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Tell your DNA what you want..."
                  className="flex-1 bg-muted/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/30 placeholder:text-muted-foreground"
                  disabled={loading}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="rounded-xl shrink-0"
                  disabled={!input.trim() || loading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
