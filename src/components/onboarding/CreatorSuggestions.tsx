import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Check, Plus, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Owner username constant
const OWNER_USERNAME = 'mrassburgers';

// Demo creators for onboarding (fallback)
const suggestedCreators = [
  { id: '1', username: 'funnymax', displayName: 'Funny Max', avatar: '', followers: '2.1M', category: 'comedy' },
  { id: '2', username: 'dancestar', displayName: 'Dance Star', avatar: '', followers: '890K', category: 'dance' },
  { id: '3', username: 'techguru', displayName: 'Tech Guru', avatar: '', followers: '1.5M', category: 'tech' },
  { id: '4', username: 'foodlover', displayName: 'Food Lover', avatar: '', followers: '650K', category: 'food' },
  { id: '5', username: 'fitnessjay', displayName: 'Fitness Jay', avatar: '', followers: '1.2M', category: 'fitness' },
  { id: '6', username: 'artistry', displayName: 'Artistry', avatar: '', followers: '430K', category: 'art' },
  { id: '7', username: 'gamerpro', displayName: 'Gamer Pro', avatar: '', followers: '3.2M', category: 'gaming' },
  { id: '8', username: 'travelbug', displayName: 'Travel Bug', avatar: '', followers: '780K', category: 'travel' },
];

interface CreatorSuggestionsProps {
  interests: string[];
  following: string[];
  onChange: (following: string[]) => void;
}

// Fetch owner profile
function useOwnerProfile() {
  return useQuery({
    queryKey: ['owner-profile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('username', OWNER_USERNAME)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });
}

// Fetch owner's following (mutuals to suggest)
function useOwnerFollowing() {
  return useQuery({
    queryKey: ['owner-following'],
    queryFn: async () => {
      // First get owner profile
      const { data: owner } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', OWNER_USERNAME)
        .maybeSingle();
      
      if (!owner) return [];
      
      // Get who owner is following
      const { data: follows, error } = await supabase
        .from('follows')
        .select(`
          following:profiles!follows_following_id_fkey(
            id, username, display_name, avatar_url
          )
        `)
        .eq('follower_id', owner.id)
        .limit(10);
      
      if (error) throw error;
      return follows?.map((f: any) => f.following).filter(Boolean) || [];
    },
  });
}

export function CreatorSuggestions({ interests, following, onChange }: CreatorSuggestionsProps) {
  const { t } = useTranslation();
  const { data: ownerProfile } = useOwnerProfile();
  const { data: ownerFollowing = [] } = useOwnerFollowing();

  // Build list: owner first, then owner's following, then demo creators
  const allCreatorsToShow = [
    // Owner profile first (if exists)
    ...(ownerProfile ? [{
      id: ownerProfile.id,
      username: ownerProfile.username,
      displayName: ownerProfile.display_name || ownerProfile.username,
      avatar: ownerProfile.avatar_url || '',
      followers: 'Owner',
      isOwner: true,
    }] : []),
    // Owner's following (mutuals)
    ...ownerFollowing.map((f: any) => ({
      id: f.id,
      username: f.username,
      displayName: f.display_name || f.username,
      avatar: f.avatar_url || '',
      followers: 'Suggested',
      isMutual: true,
    })),
    // Demo creators filtered by interests
    ...(interests.length > 0
      ? suggestedCreators.filter(c => interests.includes(c.category))
      : suggestedCreators.slice(0, 4)),
  ];

  const toggleFollow = (id: string) => {
    if (following.includes(id)) {
      onChange(following.filter((f) => f !== id));
    } else {
      onChange([...following, id]);
    }
  };

  const followAll = () => {
    const allIds = allCreatorsToShow.map(c => c.id);
    onChange(allIds);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">{t('onboarding.step2Title')}</h2>
        <p className="text-muted-foreground mt-2">{t('onboarding.step2Subtitle')}</p>
      </div>

      <div className="flex justify-center">
        <Button 
          variant="outline" 
          onClick={followAll}
          className="gradient-border"
        >
          Follow All ({allCreatorsToShow.length})
        </Button>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {allCreatorsToShow.map((creator: any, index) => (
          <motion.div
            key={creator.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className={cn(
              'flex items-center gap-4 p-4 rounded-xl border transition-all',
              following.includes(creator.id)
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card'
            )}
          >
            <Avatar className="h-12 w-12">
              <AvatarImage src={creator.avatar} />
              <AvatarFallback className="gradient-animated text-lg">
                {creator.displayName?.[0] || '?'}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate flex items-center gap-2">
                {creator.displayName}
                {creator.isOwner && <Crown className="w-4 h-4 text-yellow-500" />}
              </p>
              <p className="text-sm text-muted-foreground">
                @{creator.username} · {creator.isOwner ? '👑 Owner' : creator.isMutual ? '✨ Suggested' : creator.followers}
              </p>
            </div>

            <Button
              variant={following.includes(creator.id) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleFollow(creator.id)}
              className={cn(
                'min-w-[100px] transition-all',
                following.includes(creator.id) && 'bg-primary'
              )}
            >
              {following.includes(creator.id) ? (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  Following
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1" />
                  Follow
                </>
              )}
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
