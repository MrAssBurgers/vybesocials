import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MoreHorizontal, 
  Reply, 
  Edit3, 
  Trash2, 
  Copy, 
  Flag,
  X,
  EyeOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface MessageActionMenuProps {
  messageId: string;
  content?: string | null;
  isOwn: boolean;
  isTextMessage: boolean;
  onReply: () => void;
  onEdit?: () => void;
  onUnsendForEveryone: () => void;
  onDeleteForMe: () => void;
  onReport?: () => void;
}

export function MessageActionMenu({
  messageId,
  content,
  isOwn,
  isTextMessage,
  onReply,
  onEdit,
  onUnsendForEveryone,
  onDeleteForMe,
  onReport,
}: MessageActionMenuProps) {
  const [open, setOpen] = useState(false);

  const handleCopy = useCallback(() => {
    if (content) {
      navigator.clipboard.writeText(content);
      toast.success('Copied to clipboard');
    }
    setOpen(false);
  }, [content]);

  const handleReply = useCallback(() => {
    onReply();
    setOpen(false);
  }, [onReply]);

  const handleEdit = useCallback(() => {
    onEdit?.();
    setOpen(false);
  }, [onEdit]);

  const handleUnsend = useCallback(() => {
    onUnsendForEveryone();
    setOpen(false);
  }, [onUnsendForEveryone]);

  const handleDeleteForMe = useCallback(() => {
    onDeleteForMe();
    setOpen(false);
  }, [onDeleteForMe]);

  const handleReport = useCallback(() => {
    onReport?.();
    setOpen(false);
  }, [onReport]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover/message:opacity-100 transition-opacity rounded-full hover:bg-muted/80"
          onPointerDown={(e) => {
            (e.currentTarget as any)._pointerY = e.clientY;
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            const startY = (e.currentTarget as any)._pointerY;
            if (startY !== undefined && Math.abs(e.clientY - startY) > 8) {
              e.preventDefault();
              setOpen(false);
              return;
            }
          }}
        >
          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align={isOwn ? "end" : "start"} 
        className="min-w-[160px] z-50"
        sideOffset={4}
      >
        <DropdownMenuItem onClick={handleReply} className="gap-2">
          <Reply className="h-4 w-4" />
          Reply
        </DropdownMenuItem>

        {isOwn && isTextMessage && onEdit && (
          <DropdownMenuItem onClick={handleEdit} className="gap-2">
            <Edit3 className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
        )}

        {content && (
          <DropdownMenuItem onClick={handleCopy} className="gap-2">
            <Copy className="h-4 w-4" />
            Copy text
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {isOwn && (
          <DropdownMenuItem 
            onClick={handleUnsend} 
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Unsend for everyone
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onClick={handleDeleteForMe} className="gap-2">
          <EyeOff className="h-4 w-4" />
          Delete for me
        </DropdownMenuItem>

        {!isOwn && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={handleReport} 
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Flag className="h-4 w-4" />
              Report
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
