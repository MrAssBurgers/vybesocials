import { memo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Flame } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { useFastSignedUrl } from '@/hooks/useFastSignedUrl';

interface TrendingCreator {
  id: string;
  username: string;
  avatar_url: string | null;
  post_count: number;
}

const CreatorChip = memo(function CreatorChip({ creator, index }: { creator: TrendingCreator; index: number }) {
  const navigate = useNavigate();
  const signedUrl = useFastSignedUrl(creator.avatar_url);

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => navigate(`/u/${creator.username}`)}
      className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-card/80 border border-border/40 backdrop-blur-sm hover:bg-accent/20 transition-colors flex-shrink-0"
    >
      <Avatar className="h-7 w-7">
        <AvatarImage src={signedUrl || undefined} className="object-cover" />
        <AvatarFallback className="bg-muted text-muted-foreground text-xs">
          {creator.username?.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="text-left">
        <p className="text-xs font-semibold text-foreground leading-tight">@{creator.username}</p>
        <p className="text-[10px] text-muted-foreground leading-tight flex items-center gap-0.5">
          <Flame className="h-2.5 w-2.5 text-orange-500" />
          {creator.post_count} posts
        </p>
      </div>
    </motion.button>
  );
});

interface TrendingCreatorsProps {
  creators: TrendingCreator[];
}

export const TrendingCreators = memo(function TrendingCreators({ creators }: TrendingCreatorsProps) {
  if (!creators.length) return null;

  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <span className="text-sm font-bold text-foreground">Trending Creators</span>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {creators.map((creator, i) => (
          <CreatorChip key={creator.id} creator={creator} index={i} />
        ))}
      </div>
    </div>
  );
});
