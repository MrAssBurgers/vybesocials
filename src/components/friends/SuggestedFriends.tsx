import { memo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { UserPlus, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useSuggestedFriends } from '@/hooks/useFriendsOfFriends';
import { DiscoveryReadStatus } from './DiscoveryReadStatus';
import { triggerHaptic } from '@/lib/haptics';

export const SuggestedFriends = memo(function SuggestedFriends() {
  const { data: suggestions, isLoading, error, ageReviewRequired, retry } = useSuggestedFriends();

  if (error || ageReviewRequired || isLoading) return <DiscoveryReadStatus error={error} ageReviewRequired={ageReviewRequired} isLoading={isLoading} retry={retry} />;
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="friends-shell-card rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center">
          <Users className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold">People You May Know</h3>
          <p className="text-[10px] text-muted-foreground">Tap to view their vybe</p>
        </div>
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
                className="flex flex-col items-center w-[76px] group"
                onClick={() => triggerHaptic('light')}
              >
                <div className="friends-avatar-ring">
                  <Avatar className="h-14 w-14 border-2 border-background">
                    <AvatarImage src={person.avatar_url || undefined} />
                    <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                      {(person.display_name || person.username)?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <p className="text-xs font-semibold mt-2 truncate w-full text-center">
                  {person.display_name || person.username}
                </p>
                <p className="text-[10px] text-primary/80 font-medium">
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
