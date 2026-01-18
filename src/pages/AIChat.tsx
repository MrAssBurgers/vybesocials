import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Send, 
  Loader2, 
  Bot,
  MoreVertical,
  Sparkles,
  Settings,
  RotateCcw,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { getFunctionAuthHeaders } from '@/lib/functionAuth';
import { cn } from '@/lib/utils';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAIProfile } from '@/hooks/useAIProfile';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

// Persist messages in localStorage
const STORAGE_KEY = 'vybe_ai_chat_messages';

function loadMessages(): Message[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
    }
  } catch {}
  return [];
}

function saveMessages(messages: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {}
}

export default function AIChat() {
  const navigate = useNavigate();
  const { name: aiName, personality: aiPersonality, updateName, updatePersonality, resetToDefault } = useAIProfile();
  const [messages, setMessages] = useState<Message[]>(() => {
    const loaded = loadMessages();
    if (loaded.length === 0) {
      return [
        { 
          role: 'assistant', 
          content: `Hey there! I'm ${aiName}, your AI assistant on VYBE. I'm here to help you with content ideas, engagement tips, app features, and anything else you need. What can I help you with today? ✨`,
          timestamp: new Date(),
        }
      ];
    }
    return loaded;
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [editName, setEditName] = useState(aiName);
  const [editPersonality, setEditPersonality] = useState(aiPersonality);
  const [isSaving, setIsSaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Save messages when they change
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  // Update edit fields when profile changes
  useEffect(() => {
    setEditName(aiName);
    setEditPersonality(aiPersonality);
  }, [aiName, aiPersonality]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSaveProfile = useCallback(async () => {
    setIsSaving(true);
    // Small delay for animation effect
    await new Promise(resolve => setTimeout(resolve, 1200));
    updateName(editName);
    updatePersonality(editPersonality);
    setIsSaving(false);
    setIsProfileOpen(false);
    toast.success('AI profile updated!');
  }, [editName, editPersonality, updateName, updatePersonality]);

  const handleResetProfile = useCallback(() => {
    resetToDefault();
    setEditName('Morgan');
    setEditPersonality('A friendly, helpful AI assistant who is approachable, supportive, and genuinely interested in helping users succeed.');
    toast.success('AI profile reset to default');
  }, [resetToDefault]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { 
      role: 'user', 
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    let assistantContent = '';

    try {
      const headers = await getFunctionAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            messages: messages.map(m => ({ role: m.role, content: m.content })).concat([
              { role: 'user', content: input.trim() }
            ]),
            aiName,
            aiPersonality,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          toast.error('Too many requests. Please wait a moment.');
          return;
        }
        if (response.status === 402) {
          toast.error('AI credits exhausted.');
          return;
        }
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No reader');

      // Add empty assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date() }]);

      let buffer = '';
      let streamDone = false;
      
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { 
                  role: 'assistant', 
                  content: assistantContent,
                  timestamp: new Date(),
                };
                return updated;
              });
            }
          } catch {
            // Partial JSON - put it back and wait for more data
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }
      
      // Final flush for any remaining content
      if (buffer.trim()) {
        for (const raw of buffer.split('\n')) {
          if (!raw || raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { 
                  role: 'assistant', 
                  content: assistantContent,
                  timestamp: new Date(),
                };
                return updated;
              });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (error) {
      console.error('AI chat error:', error);
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: "Sorry, something went wrong. Please try again!", timestamp: new Date() }
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, aiName, aiPersonality]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = useCallback(() => {
    setMessages([
      { 
        role: 'assistant', 
        content: `Chat cleared! I'm ${aiName}, ready to help. What would you like to talk about? ✨`,
        timestamp: new Date(),
      }
    ]);
  }, [aiName]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-5rem)] md:h-screen bg-background">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center gap-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
          <Button variant="ghost" size="icon" onClick={() => navigate('/messages')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <button 
            className="relative"
            onClick={() => setIsProfileOpen(true)}
          >
            <div className="h-10 w-10 rounded-full gradient-animated flex items-center justify-center ring-2 ring-primary/20">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
          </button>
          <button 
            className="flex-1 text-left"
            onClick={() => setIsProfileOpen(true)}
          >
            <h2 className="font-semibold flex items-center gap-1">
              {aiName}
              <Sparkles className="h-4 w-4 text-pink-400" />
            </h2>
            <p className="text-xs text-muted-foreground">
              Tap to customize AI profile
            </p>
          </button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover">
              <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
                <Settings className="h-4 w-4 mr-2" />
                Customize AI
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={clearChat}>
                Clear Chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                "flex gap-2",
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <div className="h-8 w-8 rounded-full gradient-animated flex-shrink-0 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
              )}
              <div className="flex flex-col max-w-[80%]">
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2",
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-muted rounded-tl-sm'
                  )}
                >
                  {message.content || (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Thinking...
                    </span>
                  )}
                </div>
                <span className={cn(
                  "text-[10px] text-muted-foreground mt-1",
                  message.role === 'user' ? 'text-right' : 'text-left'
                )}>
                  {formatTime(message.timestamp)}
                </span>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-background">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask ${aiName} anything...`}
              className="flex-1"
              disabled={isLoading}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              size="icon"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* AI Profile Settings Sheet */}
      <Sheet open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Customize Your AI
            </SheetTitle>
            <SheetDescription>
              Give your AI assistant a custom name and personality
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="ai-name">AI Name</Label>
              <Input
                id="ai-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g., Morgan, Alex, Jamie..."
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground">
                What would you like to call your AI assistant?
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-personality">Personality</Label>
              <Textarea
                id="ai-personality"
                value={editPersonality}
                onChange={(e) => setEditPersonality(e.target.value)}
                placeholder="Describe how you want your AI to behave..."
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                Describe the personality and tone you want. Examples: "Professional and concise", "Friendly and encouraging", "Witty with a sense of humor"
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <AnimatePresence mode="wait">
                {isSaving ? (
                  <motion.div
                    key="saving"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full py-3 rounded-md bg-primary flex items-center justify-center gap-2"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Sparkles className="h-5 w-5 text-primary-foreground" />
                    </motion.div>
                    <motion.span 
                      className="text-primary-foreground font-medium"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      Updating your AI...
                    </motion.span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="save-button"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                  >
                    <Button onClick={handleSaveProfile} className="w-full" disabled={isSaving}>
                      <Check className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
              <Button 
                variant="outline" 
                onClick={handleResetProfile}
                className="w-full"
                disabled={isSaving}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to Default
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
