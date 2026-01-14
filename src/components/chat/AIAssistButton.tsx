import { useState, memo } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { 
  Sparkles, 
  Loader2, 
  MessageSquare, 
  Type, 
  Heart, 
  CheckCircle,
  Wand2,
} from 'lucide-react';
import { useAIMessageAssist, type AIAssistAction } from '@/hooks/useAIMessageAssist';
import { Message } from '@/hooks/useMessages';
import { toast } from 'sonner';

interface AIAssistButtonProps {
  messageText: string;
  recentMessages?: Message[];
  onTextUpdate: (newText: string) => void;
  disabled?: boolean;
}

/**
 * AI Assist Button - Optional, non-intrusive AI help for messages
 * 
 * Features:
 * - Rewrite message (shorter, clearer, friendlier)
 * - Fix grammar & tone  
 * - Suggest a reply
 * - Never auto-sends
 * - Always optional
 */
export const AIAssistButton = memo(function AIAssistButton({
  messageText,
  recentMessages,
  onTextUpdate,
  disabled,
}: AIAssistButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { 
    isProcessing, 
    rewrite, 
    makeShorter, 
    makeFriendlier, 
    fixGrammar,
    suggestReply,
  } = useAIMessageAssist();

  const handleAction = async (action: AIAssistAction) => {
    setIsOpen(false);
    
    let result: string | null = null;
    
    switch (action) {
      case 'rewrite':
        result = await rewrite(messageText);
        break;
      case 'shorter':
        result = await makeShorter(messageText);
        break;
      case 'friendlier':
        result = await makeFriendlier(messageText);
        break;
      case 'fix_grammar':
        result = await fixGrammar(messageText);
        break;
      case 'suggest_reply':
        if (recentMessages?.length) {
          result = await suggestReply(recentMessages);
        } else {
          toast.error('No recent messages to base reply on');
          return;
        }
        break;
    }
    
    if (result) {
      onTextUpdate(result);
      toast.success('AI suggestion applied', { duration: 2000 });
    }
  };

  const hasText = messageText.trim().length > 0;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 h-8 w-8 sm:h-9 sm:w-9"
          disabled={disabled || isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          AI Assist
        </div>
        <DropdownMenuSeparator />
        
        {hasText ? (
          <>
            <DropdownMenuItem onClick={() => handleAction('rewrite')}>
              <Wand2 className="h-4 w-4 mr-2" />
              Rewrite clearer
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction('shorter')}>
              <Type className="h-4 w-4 mr-2" />
              Make shorter
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction('friendlier')}>
              <Heart className="h-4 w-4 mr-2" />
              Make friendlier
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction('fix_grammar')}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Fix grammar
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onClick={() => handleAction('suggest_reply')}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Suggest a reply
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
