import { motion } from 'framer-motion';
import { useMutualFriends, UserWithMutualFriends } from '@/hooks/useMutualFriends';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus, Users } from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.8, y: 20 },
  show: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { type: 'spring' as const, stiffness: 400, damping: 25 }
  },
};

export function MutualFriendsQuickAdd({ 
  onSelect 
}: { 
  onSelect: (userId: string) => void;
}) {
  const { data: suggestions, isLoading } = useMutualFriends();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <Users className="h-3 w-3" />
          <span>Quick Add</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="space-y-3">
      <motion.div 
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2 text-xs text-muted-foreground px-1"
      >
        <Users className="h-3 w-3 animate-pulse" />
        <span>Quick Add</span>
      </motion.div>
      
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-2"
      >
        {suggestions.slice(0, 6).map((user) => (
          <MutualFriendCard key={user.id} user={user} onSelect={onSelect} />
        ))}
      </motion.div>
    </div>
  );
}

function MutualFriendCard({
  user,
  onSelect,
}: {
  user: UserWithMutualFriends;
  onSelect: (userId: string) => void;
}) {
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="relative bg-card border border-border rounded-xl p-3 flex flex-col items-center gap-2 hover:shadow-lg transition-shadow cursor-pointer group"
      onClick={() => onSelect(user.id)}
    >
      {/* Animated gradient border on hover */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative">
        <motion.div
          whileHover={{ rotate: [0, -5, 5, 0] }}
          transition={{ duration: 0.3 }}
        >
          <Avatar className="h-12 w-12 ring-2 ring-background shadow-md">
            <AvatarImage src={user.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold">
              {user.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </motion.div>
        
        {/* Add button overlay */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring' }}
          className="absolute -bottom-1 -right-1 h-5 w-5 bg-primary rounded-full flex items-center justify-center shadow-sm"
        >
          <UserPlus className="h-3 w-3 text-primary-foreground" />
        </motion.div>
      </div>
      
      <div className="text-center z-10">
        <p className="text-sm font-medium truncate max-w-[100px]">
          {user.display_name || user.username}
        </p>
        
        {/* Mutual friends indicator */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-center gap-1 mt-1"
        >
          {user.mutual_friends.slice(0, 2).map((mf, i) => (
            <motion.div
              key={mf.id}
              initial={{ x: -5 * i, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.05 }}
              style={{ marginLeft: i > 0 ? -8 : 0 }}
            >
              <Avatar className="h-4 w-4 ring-1 ring-background">
                <AvatarImage src={mf.avatar_url || undefined} />
                <AvatarFallback className="text-[8px] bg-muted">
                  {mf.username.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </motion.div>
          ))}
          <span className="text-[10px] text-muted-foreground ml-1">
            {user.mutual_friends_count} mutual{user.mutual_friends_count > 1 ? 's' : ''}
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}
