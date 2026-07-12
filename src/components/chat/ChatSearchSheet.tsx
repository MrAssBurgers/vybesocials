import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2 } from 'lucide-react';
import {
  useChatSearch,
  type ChatSearchFilters,
  type ChatSearchMessageType,
} from '@/hooks/useChatSearch';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ChatSearchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
  onSelectMessage?: (messageId: string) => void;
}

const TYPE_OPTIONS: { id: ChatSearchMessageType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'text', label: 'Text' },
  { id: 'image', label: 'Photos' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Voice' },
  { id: 'link', label: 'Links' },
  { id: 'file', label: 'Files' },
];

export function ChatSearchSheet({
  open,
  onOpenChange,
  conversationId,
  onSelectMessage,
}: ChatSearchSheetProps) {
  const [keyword, setKeyword] = useState('');
  const [messageType, setMessageType] = useState<ChatSearchMessageType>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filters: ChatSearchFilters = {
    conversationId,
    keyword,
    messageType,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    limit: 60,
  };

  const { data: results = [], isFetching } = useChatSearch(filters, open && !!conversationId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Search messages</SheetTitle>
        </SheetHeader>

        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Keyword"
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMessageType(opt.id)}
              className={cn(
                'dm-inbox-chip shrink-0',
                messageType === opt.id && 'dm-inbox-chip--active',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {isFetching && (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {!isFetching && results.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No messages found</p>
          )}
          {results.map((msg) => (
            <button
              key={msg.id}
              type="button"
              onClick={() => {
                onSelectMessage?.(msg.id);
                onOpenChange(false);
              }}
              className="w-full text-left rounded-xl border border-border/40 px-3 py-2 hover:bg-muted/40"
            >
              <p className="text-xs text-muted-foreground mb-0.5">
                {format(new Date(msg.created_at), 'MMM d, HH:mm')}
                {msg.media_type ? ` · ${msg.media_type}` : ''}
              </p>
              <p className="text-sm truncate">{msg.content || '(media)'}</p>
            </button>
          ))}
        </div>

        <Button variant="secondary" className="mt-2" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </SheetContent>
    </Sheet>
  );
}
