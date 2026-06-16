import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { db } from '@/lib/firebase';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

interface MentionUser {
  id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onSubmit?: () => void;
  disabled?: boolean;
  rows?: number;
}

export const MentionInput = memo(function MentionInput({
  value,
  onChange,
  placeholder = 'Add a comment...',
  className,
  onSubmit,
  disabled,
  rows = 1,
}: MentionInputProps) {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const debouncedQuery = useDebouncedValue(mentionQuery, 200);

  // Search for users when mention query changes
  useEffect(() => {
    if (!showMentions || !debouncedQuery) {
      setMentionUsers([]);
      return;
    }

    const searchUsers = async () => {
      const { data } = await db
        .from('profiles')
        .select('id, username, avatar_url, display_name')
        .ilike('username', `${debouncedQuery}%`)
        .limit(6);

      setMentionUsers(data || []);
      setSelectedIndex(0);
    };

    searchUsers();
  }, [debouncedQuery, showMentions]);

  // Detect @ mentions while typing
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const textarea = e.target;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    
    // Find the last @ before cursor that's not part of a completed mention
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setShowMentions(true);
      
      // Calculate position for dropdown
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMentionPosition({
          top: rect.height + 4,
          left: 0,
        });
      }
    } else {
      setShowMentions(false);
      setMentionQuery('');
    }
  }, [onChange]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showMentions || mentionUsers.length === 0) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit?.();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % mentionUsers.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + mentionUsers.length) % mentionUsers.length);
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        insertMention(mentionUsers[selectedIndex]);
        break;
      case 'Escape':
        setShowMentions(false);
        break;
    }
  }, [showMentions, mentionUsers, selectedIndex, onSubmit]);

  // Insert a mention into the text
  const insertMention = useCallback((user: MentionUser) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);
    
    // Replace the @query with @username
    const newTextBefore = textBeforeCursor.replace(/@\w*$/, `@${user.username} `);
    const newValue = newTextBefore + textAfterCursor;
    
    onChange(newValue);
    setShowMentions(false);
    setMentionQuery('');
    
    // Set cursor position after the mention
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newTextBefore.length, newTextBefore.length);
    }, 0);
  }, [value, onChange]);

  return (
    <div ref={containerRef} className="relative flex-1">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={cn(
          "min-h-[40px] resize-none py-2",
          className
        )}
      />

      {/* Mention suggestions dropdown */}
      <AnimatePresence>
        {showMentions && mentionUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full bg-background border border-border rounded-lg shadow-lg overflow-hidden"
            style={{ top: mentionPosition.top }}
          >
            {mentionUsers.map((user, index) => (
              <button
                key={user.id}
                type="button"
                onClick={() => insertMention(user)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                  index === selectedIndex ? "bg-accent" : "hover:bg-muted"
                )}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatar_url || undefined} />
                  <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">@{user.username}</p>
                  {user.display_name && (
                    <p className="text-xs text-muted-foreground truncate">{user.display_name}</p>
                  )}
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
