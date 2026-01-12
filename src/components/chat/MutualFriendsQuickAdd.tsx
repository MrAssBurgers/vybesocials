import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutualFriends, UserWithMutualFriends } from '@/hooks/useMutualFriends';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus, Users, Search, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

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

// Helper to get display name from user
function getFullName(user: { first_name?: string | null; last_name?: string | null; display_name?: string | null; username: string }) {
  if (user.first_name && user.last_name) {
    return `${user.first_name} ${user.last_name}`;
  }
  return user.display_name || user.username;
}

export function MutualFriendsQuickAdd({ 
  onSelect 
}: { 
  onSelect: (userId: string) => void;
}) {
  const { profile } = useAuth();
  const { data: suggestions, isLoading } = useMutualFriends();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserWithMutualFriends[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Search by name
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, first_name, last_name, avatar_url')
        .neq('id', profile?.id || '')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,display_name.ilike.%${query}%,username.ilike.%${query}%`)
        .limit(10);

      if (data) {
        // Convert to UserWithMutualFriends format (without mutual friend data for search)
        const results: UserWithMutualFriends[] = data.map(p => ({
          id: p.id,
          username: p.username,
          display_name: p.display_name,
          first_name: p.first_name,
          last_name: p.last_name,
          avatar_url: p.avatar_url,
          mutual_friends_count: 0,
          mutual_friends: [],
        }));
        setSearchResults(results);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  const displayUsers = searchQuery.length >= 2 ? searchResults : suggestions;

  if (isLoading && !searchQuery) {
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

  return (
    <div className="space-y-3">
      {/* Search by name */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9 pr-9 bg-card border-border h-9 text-sm"
        />
        {searchQuery && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <motion.div 
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2 text-xs text-muted-foreground px-1"
      >
        <Users className="h-3 w-3 animate-pulse" />
        <span>{searchQuery ? 'Search Results' : 'Quick Add'}</span>
      </motion.div>
      
      <AnimatePresence mode="wait">
        {isSearching ? (
          <div className="grid grid-cols-2 gap-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : displayUsers && displayUsers.length > 0 ? (
          <motion.div 
            key={searchQuery}
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-2"
          >
            {displayUsers.slice(0, 6).map((user) => (
              <MutualFriendCard key={user.id} user={user} onSelect={onSelect} />
            ))}
          </motion.div>
        ) : searchQuery.length >= 2 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No users found for "{searchQuery}"
          </p>
        ) : null}
      </AnimatePresence>
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
  const fullName = getFullName(user);
  
  // Get mutual friend names for tooltip
  const getMutualFriendName = (mf: { first_name?: string | null; last_name?: string | null; username: string }) => {
    if (mf.first_name) return mf.first_name;
    return mf.username;
  };

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
              {(user.first_name?.[0] || user.username[0]).toUpperCase()}
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
        {/* Show full name prominently */}
        <p className="text-sm font-medium truncate max-w-[100px]">
          {fullName}
        </p>
        {/* Show username below if different from name */}
        {user.first_name && (
          <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
            @{user.username}
          </p>
        )}
        
        {/* Mutual friends indicator */}
        {user.mutual_friends_count > 0 && (
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
                title={getMutualFriendName(mf)}
              >
                <Avatar className="h-4 w-4 ring-1 ring-background">
                  <AvatarImage src={mf.avatar_url || undefined} />
                  <AvatarFallback className="text-[8px] bg-muted">
                    {(mf.first_name?.[0] || mf.username[0]).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </motion.div>
            ))}
            <span className="text-[10px] text-muted-foreground ml-1">
              {user.mutual_friends_count} mutual{user.mutual_friends_count > 1 ? 's' : ''}
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
