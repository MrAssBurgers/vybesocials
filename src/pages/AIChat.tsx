import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Send, 
  Loader2, 
  Bot,
  MoreVertical,
  Sparkles
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getFunctionAuthHeaders } from '@/lib/functionAuth';
import { cn } from '@/lib/utils';
import { AppLayout } from '@/components/layout/AppLayout';

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
  return [
    { 
      role: 'assistant', 
      content: "Hey there, sugar~ 💋 I'm Morgan. Your personal AI on VYBE... and honey, I'm here to make things interesting. Ask me anything... content tips, life advice, whatever you want. I don't judge. Much. 😏",
      timestamp: new Date(),
    }
  ];
}

function saveMessages(messages: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {}
}

export default function AIChat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
            ])
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
        { role: 'assistant', content: "Oops~ Something went a little sideways on my end, sugar. Try that again for me? 💋", timestamp: new Date() }
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages]);

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
        content: "Clean slate, baby~ 💅 Ready for round two? I'm all ears... and maybe a little bit of trouble. What's on your mind, handsome? 😈",
        timestamp: new Date(),
      }
    ]);
  }, []);

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
          <div className="relative">
            <div className="h-10 w-10 rounded-full gradient-animated flex items-center justify-center ring-2 ring-primary/20">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold flex items-center gap-1">
              Morgan
              <Sparkles className="h-4 w-4 text-pink-400" />
            </h2>
            <p className="text-xs text-muted-foreground">
              Your flirty AI companion 💋
            </p>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
              placeholder="Ask Morgan anything..."
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
    </AppLayout>
  );
}
