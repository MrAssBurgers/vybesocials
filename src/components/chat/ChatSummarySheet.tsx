import { useState, memo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, FileText } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { useAIChatSummary } from '@/hooks/useAIMessageAssist';
import { Message } from '@/hooks/useMessages';

interface ChatSummarySheetProps {
  messages: Message[];
  trigger?: React.ReactNode;
}

/**
 * AI Chat Summary Sheet
 * 
 * Features:
 * - Generates short summary of recent messages
 * - Useful for group chats and missed conversations
 * - Does NOT summarize sensitive content outside chat
 */
export const ChatSummarySheet = memo(function ChatSummarySheet({
  messages,
  trigger,
}: ChatSummarySheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { summary, isLoading, generateSummary, clearSummary } = useAIChatSummary();

  const handleOpen = async (open: boolean) => {
    setIsOpen(open);
    if (open && !summary) {
      await generateSummary(messages);
    }
    if (!open) {
      clearSummary();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="gap-2">
            <FileText className="h-4 w-4" />
            Summarize
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[40vh] rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <VybeMiniIcon size={20} showSparkles />
            Chat Summary
          </SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="mt-4 h-[calc(100%-4rem)]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating summary...</p>
            </div>
          ) : summary ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-muted/50 border border-border">
                <p className="text-sm leading-relaxed">{summary}</p>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Based on the last {Math.min(messages.length, 50)} messages
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">No summary available</p>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
});
