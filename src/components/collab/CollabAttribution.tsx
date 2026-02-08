import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Star } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { usePostCollaborators, CollabPost } from '@/hooks/useSponsors';
import { cn } from '@/lib/utils';

interface CollabAttributionProps {
  postId: string;
  authorId: string;
  authorUsername: string;
  authorAvatar?: string | null;
  authorVerified?: boolean | null;
  compact?: boolean;
}

export const CollabAttribution = memo(function CollabAttribution({
  postId,
  authorId,
  authorUsername,
  authorAvatar,
  authorVerified,
  compact = false,
}: CollabAttributionProps) {
  const navigate = useNavigate();
  const { data: collaborators } = usePostCollaborators(postId);

  // Only show accepted collaborators
  const acceptedCollabs = collaborators?.filter(c => c.accepted_at) || [];
  
  // If no collaborators, just show the author
  if (acceptedCollabs.length === 0) {
    return (
      <button
        onClick={() => navigate(`/u/${authorUsername}`)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <Avatar className={compact ? "h-6 w-6" : "h-8 w-8"}>
          <AvatarImage src={authorAvatar || undefined} />
          <AvatarFallback>
            {authorUsername?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className={cn("font-medium", compact ? "text-xs" : "text-sm")}>
          {authorUsername}
          {authorVerified && (
            <CheckCircle2 className="inline-block h-3 w-3 ml-1 text-primary fill-primary" />
          )}
        </span>
      </button>
    );
  }

  // Has sponsor collab
  const sponsorCollab = acceptedCollabs.find(c => c.role === 'sponsor');
  const regularCollabs = acceptedCollabs.filter(c => c.role !== 'sponsor');

  return (
    <div className="flex flex-col gap-2">
      {/* Sponsored disclosure */}
      {sponsorCollab && (
        <Badge 
          variant="outline" 
          className="text-[10px] w-fit flex items-center gap-1"
        >
          <Star className="h-3 w-3" />
          Sponsored
        </Badge>
      )}
      
      {/* Authors/Collaborators */}
      <div className="flex items-center gap-2">
        {/* Primary author */}
        <button
          onClick={() => navigate(`/u/${authorUsername}`)}
          className="flex items-center gap-1 hover:opacity-80 transition-opacity"
        >
          <Avatar className={compact ? "h-6 w-6" : "h-8 w-8"}>
            <AvatarImage src={authorAvatar || undefined} />
            <AvatarFallback>
              {authorUsername?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>

        {/* Collaborators */}
        {regularCollabs.slice(0, 2).map((collab) => (
          <button
            key={collab.id}
            onClick={() => navigate(`/u/${collab.collaborator?.username}`)}
            className="flex items-center gap-1 hover:opacity-80 transition-opacity -ml-2"
          >
            <Avatar className={cn(
              compact ? "h-6 w-6" : "h-8 w-8",
              "border-2 border-background"
            )}>
              <AvatarImage src={collab.collaborator?.avatar_url || undefined} />
              <AvatarFallback>
                {collab.collaborator?.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>
        ))}

        {/* Names */}
        <div className={cn("flex flex-wrap items-center gap-1", compact ? "text-xs" : "text-sm")}>
          <button
            onClick={() => navigate(`/u/${authorUsername}`)}
            className="font-medium hover:text-primary transition-colors"
          >
            {authorUsername}
            {authorVerified && (
              <CheckCircle2 className="inline-block h-3 w-3 ml-0.5 text-primary fill-primary" />
            )}
          </button>
          
          {regularCollabs.length > 0 && (
            <>
              <span className="text-muted-foreground">&</span>
              {regularCollabs.slice(0, 1).map((collab) => (
                <button
                  key={collab.id}
                  onClick={() => navigate(`/u/${collab.collaborator?.username}`)}
                  className="font-medium hover:text-primary transition-colors"
                >
                  {collab.collaborator?.username}
                  {collab.collaborator?.is_verified && (
                    <CheckCircle2 className="inline-block h-3 w-3 ml-0.5 text-primary fill-primary" />
                  )}
                </button>
              ))}
              {regularCollabs.length > 1 && (
                <span className="text-muted-foreground">
                  +{regularCollabs.length - 1} more
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sponsor attribution */}
      {sponsorCollab && sponsorCollab.collaborator && (
        <button
          onClick={() => navigate(`/u/${sponsorCollab.collaborator?.username}`)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>Paid partnership with</span>
          <span className="font-medium">{sponsorCollab.collaborator.username}</span>
          {sponsorCollab.collaborator.is_verified && (
            <CheckCircle2 className="h-3 w-3 text-primary fill-primary" />
          )}
        </button>
      )}
    </div>
  );
});
