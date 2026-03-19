import { memo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { UserPlus, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useSuggestedFriends } from '@/hooks/useFriendsOfFriends';
import { triggerHaptic } from '@/lib/haptics';

export const SuggestedFriends = memo(function SuggestedFriends() {
  const { data: suggestions, isLoading } = useSuggestedFriends();

  if (isLoading || !suggestions || suggestions.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">People You May Know</h3>
      </div>

      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-2">
          {suggestions.slice(0, 10).map((person, i) => (
            <motion.div
              key={person.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to={`/u/${person.username}`}
                className="flex flex-col items-center w-20 group"
                onClick={() => triggerHaptic('light')}
              >
                <Avatar className="h-14 w-14 ring-2 ring-primary/20 group-hover:ring-primary/50 transition-all">
                  <AvatarImage src={person.avatar_url || undefined} />
                  <AvatarFallback className="text-sm font-semibold">
                    {(person.display_name || person.username)?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <p className="text-xs font-medium mt-1.5 truncate w-full text-center">
                  {person.display_name || person.username}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {person.mutual_count > 0
                    ? `${person.mutual_count} mutual${person.mutual_count !== 1 ? 's' : ''}`
                    : `@${person.username}`}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
});
