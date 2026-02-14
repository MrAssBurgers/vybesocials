import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Target, Zap, Clock, Trophy, Gift, CheckCircle2, ArrowRight,
  Camera, MessageCircle, Heart, UserPlus, Users, Send, Bookmark,
  User, LogIn, Share2, Hash
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { CHALLENGE_ROUTES } from '@/hooks/useChallenges';
import { cn } from '@/lib/utils';

interface ChallengeDetailSheetProps {
  challenge: {
    id: string;
    title: string;
    description: string | null;
    type: string;
    requirement_type: string;
    requirement_count: number;
    reward_xp: number;
    current_count: number;
    is_completed: boolean;
    is_claimed: boolean;
    progress_percentage: number;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClaim?: () => void;
}

const REQUIREMENT_INFO: Record<string, { 
  icon: typeof Target;
  howTo: string;
  steps: string[];
}> = {
  post: {
    icon: Camera,
    howTo: 'Create and share posts with the community.',
    steps: [
      'Tap the + button in the bottom nav',
      'Choose a photo or video from your gallery',
      'Add a caption and tags',
      'Hit "Post" to share it',
    ],
  },
  clip: {
    icon: Camera,
    howTo: 'Upload short video clips.',
    steps: [
      'Tap the + button in the bottom nav',
      'Select a video clip to upload',
      'Add a caption and relevant tags',
      'Share it with the community',
    ],
  },
  story: {
    icon: Camera,
    howTo: 'Share temporary stories that disappear after 24 hours.',
    steps: [
      'Tap the + button in the bottom nav',
      'Choose "Story" as the post type',
      'Select a photo or video',
      'Post your story',
    ],
  },
  comment: {
    icon: MessageCircle,
    howTo: 'Leave comments on other people\'s posts.',
    steps: [
      'Browse posts on the Explore page',
      'Tap on a post to open it',
      'Type your comment in the text box',
      'Hit send to post your comment',
    ],
  },
  like: {
    icon: Heart,
    howTo: 'Like posts from other creators.',
    steps: [
      'Browse your feed or the Explore page',
      'Double-tap a post or tap the ❤️ icon',
      'Each like counts toward your progress',
    ],
  },
  react: {
    icon: Heart,
    howTo: 'React to posts with emojis.',
    steps: [
      'Open any post from your feed',
      'Tap the reaction button',
      'Choose your emoji reaction',
    ],
  },
  follow: {
    icon: UserPlus,
    howTo: 'Follow other users to see their content.',
    steps: [
      'Go to the Explore page',
      'Find users you\'re interested in',
      'Tap the "Follow" button on their profile',
    ],
  },
  follower: {
    icon: Users,
    howTo: 'Get other users to follow you.',
    steps: [
      'Post quality content regularly',
      'Engage with other users\' posts',
      'Complete your profile to attract followers',
      'Share your profile link',
    ],
  },
  message: {
    icon: Send,
    howTo: 'Send direct messages to your friends.',
    steps: [
      'Go to the Messages tab',
      'Open a conversation or start a new one',
      'Type and send a message',
    ],
  },
  new_conversation: {
    icon: MessageCircle,
    howTo: 'Start new conversations with people.',
    steps: [
      'Go to the Messages tab',
      'Tap the new message icon',
      'Select a friend to message',
      'Send your first message',
    ],
  },
  snap_sent: {
    icon: Camera,
    howTo: 'Send photo or video snaps in your chats.',
    steps: [
      'Open a conversation in Messages',
      'Tap the camera icon to take or select a photo/video',
      'Send it as a snap message',
    ],
  },
  channel_message: {
    icon: Hash,
    howTo: 'Send messages in community channels.',
    steps: [
      'Go to the Communities tab',
      'Join or open a community',
      'Select a channel',
      'Send a message in the channel',
    ],
  },
  bookmark: {
    icon: Bookmark,
    howTo: 'Save posts to your bookmarks for later.',
    steps: [
      'Find a post you want to save',
      'Tap the bookmark icon on the post',
      'View saved posts in your profile',
    ],
  },
  complete_profile: {
    icon: User,
    howTo: 'Fill out all sections of your profile.',
    steps: [
      'Go to Settings → Edit Profile',
      'Add a profile picture (avatar)',
      'Set your display name',
      'Write a bio about yourself',
      'All three fields must be filled to complete this',
    ],
  },
  invite: {
    icon: Share2,
    howTo: 'Invite friends to join VYBE.',
    steps: [
      'Go to your profile or settings',
      'Find the "Invite Friends" option',
      'Share your invite link with friends',
      'They need to sign up for it to count',
    ],
  },
  daily_login: {
    icon: LogIn,
    howTo: 'Simply open the app every day.',
    steps: [
      'Open VYBE once per day',
      'Your login is automatically tracked',
      'Keep your streak going for bonus rewards!',
    ],
  },
  login: {
    icon: LogIn,
    howTo: 'Log into VYBE.',
    steps: [
      'Open the app and make sure you\'re signed in',
      'This completes automatically',
    ],
  },
};

export function ChallengeDetailSheet({ challenge, open, onOpenChange, onClaim }: ChallengeDetailSheetProps) {
  const navigate = useNavigate();

  if (!challenge) return null;

  const info = REQUIREMENT_INFO[challenge.requirement_type] || {
    icon: Target,
    howTo: challenge.description || 'Complete this challenge to earn XP.',
    steps: ['Follow the instructions to complete this challenge.'],
  };

  const Icon = info.icon;
  const route = CHALLENGE_ROUTES[challenge.requirement_type];
  const typeLabel = challenge.type === 'daily' ? 'Daily' : challenge.type === 'weekly' ? 'Weekly' : 'Achievement';
  const TypeIcon = challenge.type === 'daily' ? Zap : challenge.type === 'weekly' ? Clock : Trophy;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto px-5 pb-8">
        <SheetHeader className="pb-2">
          <SheetTitle className="sr-only">{challenge.title}</SheetTitle>
        </SheetHeader>

        {/* Icon + Title */}
        <div className="flex flex-col items-center text-center mb-5">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(
              "h-16 w-16 rounded-2xl flex items-center justify-center mb-3",
              challenge.is_completed 
                ? "bg-primary/20" 
                : "bg-gradient-to-br from-primary/20 to-accent/20"
            )}
          >
            {challenge.is_completed ? (
              <CheckCircle2 className="h-8 w-8 text-primary" />
            ) : (
              <Icon className="h-8 w-8 text-primary" />
            )}
          </motion.div>

          <h2 className="text-xl font-bold text-foreground mb-1">{challenge.title}</h2>
          
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <TypeIcon className="h-3 w-3" />
              {typeLabel}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Gift className="h-3 w-3" />
              +{challenge.reward_xp} XP
            </Badge>
          </div>
        </div>

        {/* Progress */}
        <GlassCard className="p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-semibold text-foreground">
              {challenge.current_count} / {challenge.requirement_count}
            </span>
          </div>
          <Progress value={challenge.progress_percentage} className="h-2.5 mb-1" />
          <p className="text-xs text-muted-foreground text-right">
            {challenge.is_completed ? '✅ Completed!' : `${Math.round(challenge.progress_percentage)}%`}
          </p>
        </GlassCard>

        {/* How to complete */}
        {!challenge.is_completed && (
          <GlassCard className="p-4 mb-4">
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              How to Complete
            </h3>
            <p className="text-sm text-muted-foreground mb-3">{info.howTo}</p>
            <ol className="space-y-2">
              {info.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-foreground/80">{step}</span>
                </li>
              ))}
            </ol>
          </GlassCard>
        )}

        {/* Description if available */}
        {challenge.description && (
          <p className="text-sm text-muted-foreground text-center mb-4">
            {challenge.description}
          </p>
        )}

        {/* Action button */}
        {challenge.is_completed && !challenge.is_claimed && onClaim ? (
          <Button
            onClick={() => {
              onClaim();
              onOpenChange(false);
            }}
            className="w-full h-12 text-base font-bold shadow-[0_0_16px_hsl(var(--primary)/0.4)]"
          >
            <Gift className="h-5 w-5 mr-2" />
            Claim {challenge.reward_xp} XP
          </Button>
        ) : challenge.is_completed && challenge.is_claimed ? (
          <Button variant="secondary" disabled className="w-full h-12 text-base">
            <CheckCircle2 className="h-5 w-5 mr-2" />
            Completed & Claimed
          </Button>
        ) : route ? (
          <Button
            onClick={() => {
              onOpenChange(false);
              navigate(route);
            }}
            className="w-full h-12 text-base font-bold"
          >
            Go Complete It
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
