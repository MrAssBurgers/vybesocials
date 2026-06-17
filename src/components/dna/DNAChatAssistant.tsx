import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, X, Sparkles, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { invokeEdgeFeature, EDGE_UNAVAILABLE_TOAST } from '@/lib/edgeFeature';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import type { VybeDNA } from '@/hooks/useVybeDNA';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

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
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || !user) return;

    const userMsg: Message = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setStreamingText('');

    const preferencesUpdated = false;

    try {
      const { data, unavailable } = await invokeEdgeFeature<{ reply?: string }>(
        'dna-chat',
        {
          message: text.trim(),
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        },
      );

      if (unavailable || !data?.reply) {
        toast.message(EDGE_UNAVAILABLE_TOAST);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'DNA chat is coming soon — check back after the next update.' },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply!, preferencesUpdated },
      ]);

      if (preferencesUpdated) {
        toast.success('Your feed preferences updated! 🧬');
      }
    } catch (e: any) {
      toast.error(e.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
      setStreamingText('');
    }
  }, [messages, isLoading, user]);

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
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />

            <motion.div
              className="fixed z-50 flex flex-col bg-card border border-border/50 rounded-3xl shadow-2xl overflow-hidden inset-x-2 bottom-2 top-4 sm:inset-auto sm:right-4 sm:bottom-4 sm:top-auto sm:w-[420px] sm:h-[640px] sm:max-h-[85vh]"
              initial={{ y: 40, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            >
              {/* Header */}
              <div className="shrink-0 px-4 py-3 border-b border-border/30 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-md shadow-primary/30 shrink-0">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-sm leading-tight">VYBE AI</h2>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                    <span className="inline-flex items-center gap-0.5">⚡<span className="font-medium text-foreground/80">{Math.round((pv.activity || 0) * 100)}%</span></span>
                    <span className="opacity-40">·</span>
                    <span className="inline-flex items-center gap-0.5">💬<span className="font-medium text-foreground/80">{Math.round((pv.social || 0) * 100)}%</span></span>
                    <span className="opacity-40">·</span>
                    <span className="inline-flex items-center gap-0.5">🎨<span className="font-medium text-foreground/80">{Math.round((pv.creative || 0) * 100)}%</span></span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="rounded-full shrink-0 h-9 w-9" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.length === 0 && !isLoading && (
                  <div className="space-y-4 pt-8">
                    <div className="text-center space-y-2">
                      <motion.div
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Sparkles className="h-12 w-12 mx-auto text-primary/60" />
                      </motion.div>
                      <p className="text-sm font-semibold">Your VYBE Assistant</p>
                      <p className="text-xs text-muted-foreground max-w-[250px] mx-auto">
                        Ask me anything about VYBE — tune your feed, explore features, or just chat.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      {SUGGESTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => sendMessage(s)}
                          className="p-3 rounded-2xl border border-border/50 bg-muted/30 hover:border-primary/40 hover:bg-muted/50 transition-colors text-left"
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
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                    )}
                    {msg.preferencesUpdated && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <Zap className="h-3 w-3 text-primary" />
                        <span className="text-[10px] font-semibold text-primary">Feed updated</span>
                      </div>
                    )}
                  </motion.div>
                ))}

                {/* Streaming bubble */}
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-muted/60"
                  >
                    {streamingText ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                        <ReactMarkdown>{streamingText}</ReactMarkdown>
                        <span className="inline-block w-[2px] h-[14px] bg-foreground/70 ml-0.5 animate-pulse align-middle" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-xs">Thinking...</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Input */}
              <div className="shrink-0 px-3 py-3 border-t border-border/30 bg-background/60 backdrop-blur-xl">
                <form
                  onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Ask VYBE anything..."
                    className="flex-1 bg-muted/50 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/30 placeholder:text-muted-foreground"
                    disabled={isLoading}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="rounded-full shrink-0 h-10 w-10"
                    disabled={!input.trim() || isLoading}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
