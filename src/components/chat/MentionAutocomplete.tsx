import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface Member {
  user_id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
}

interface MentionAutocompleteProps {
  query: string;
  members: Member[];
  onSelect: (member: Member) => void;
  visible: boolean;
}

export const MentionAutocomplete = memo(function MentionAutocomplete({ 
  query, members, onSelect, visible 
}: MentionAutocompleteProps) {
  const filtered = useMemo(() => {
    if (!query) return members.slice(0, 5);
    const q = query.toLowerCase();
    return members
      .filter(m => 
        m.username?.toLowerCase().includes(q) || 
        m.display_name?.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [query, members]);

  if (!visible || filtered.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-card border border-border/50 rounded-xl shadow-lg overflow-hidden z-50"
    >
      {filtered.map((member) => (
        <button
          key={member.user_id}
          onClick={() => onSelect(member)}
          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
        >
          <Avatar className="h-7 w-7">
            <AvatarImage src={member.avatar_url || ''} />
            <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
              {(member.display_name || member.username || '?')[0]}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {member.display_name || member.username}
            </p>
            {member.username && (
              <p className="text-[10px] text-muted-foreground">@{member.username}</p>
            )}
          </div>
        </button>
      ))}
    </motion.div>
  );
});
