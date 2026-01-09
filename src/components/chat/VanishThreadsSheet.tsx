import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Ghost, 
  Plus, 
  Send, 
  Clock,
  X,
  Flame
} from 'lucide-react';
import { useVanishThreads, useVanishMessages } from '@/hooks/useDMSettings';
import { useAuth } from '@/lib/auth';
import { formatDistanceToNow } from 'date-fns';

interface VanishThreadsSheetProps {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VanishThreadsSheet({ conversationId, open, onOpenChange }: VanishThreadsSheetProps) {
  const { threads, createThread } = useVanishThreads(conversationId);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const handleCreateThread = async () => {
    const thread = await createThread('New vanish thread');
    setActiveThreadId(thread.id);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Ghost className="h-5 w-5" />
            Vanish Threads
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Messages auto-delete after 24h 👻
          </p>
        </SheetHeader>

        <AnimatePresence mode="wait">
          {activeThreadId ? (
            <VanishThreadChat 
              key="chat"
              threadId={activeThreadId} 
              onBack={() => setActiveThreadId(null)}
            />
          ) : (
            <motion.div 
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 p-4 space-y-3"
            >
              <Button 
                onClick={handleCreateThread}
                className="w-full justify-start gap-2"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
                Start new vanish thread
              </Button>

              {threads.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Ghost className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No active vanish threads</p>
                  <p className="text-xs mt-1">Create one for ephemeral chats!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {threads.map((thread) => (
                    <motion.button
                      key={thread.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setActiveThreadId(thread.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <Flame className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {thread.title || 'Vanish Thread'}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>Expires {formatDistanceToNow(new Date(thread.expires_at), { addSuffix: true })}</span>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}

function VanishThreadChat({ threadId, onBack }: { threadId: string; onBack: () => void }) {
  const { profile } = useAuth();
  const { messages, sendMessage } = useVanishMessages(threadId);
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage({ content: text.trim() });
    setText('');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col"
    >
      <div className="p-3 border-b border-border flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <X className="h-4 w-4" />
        </Button>
        <Ghost className="h-5 w-5 text-primary" />
        <span className="font-medium">Vanish Thread</span>
      </div>

      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-3">
          {messages.map((msg) => {
            const isOwn = msg.sender_id === profile?.id;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                {!isOwn && (
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={msg.sender?.avatar_url || undefined} />
                    <AvatarFallback>{msg.sender?.username?.[0]}</AvatarFallback>
                  </Avatar>
                )}
                <div 
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    isOwn 
                      ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                      : 'bg-muted rounded-tl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a vanishing message..."
          className="flex-1"
        />
        <Button size="icon" onClick={handleSend} disabled={!text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}
