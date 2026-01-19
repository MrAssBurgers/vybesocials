import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, QrCode, Users, Gift, Star, Sparkles, Share2, Nfc } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useInviteStats, useUserBadges, getInviteUrl } from '@/hooks/useInvites';
import { InviteLeaderboard } from '@/components/invite/InviteLeaderboard';
import { NFCFriendShare } from '@/components/friends/NFCFriendShare';
import { useAuth } from '@/lib/auth';
import { analytics } from '@/lib/analytics';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const MILESTONES = [
  { count: 1, badge: 'First Invite', icon: '🌟', reward: 'Badge' },
  { count: 3, badge: 'Rising Star', icon: '🎨', reward: 'Theme Unlock' },
  { count: 10, badge: 'Early Builder', icon: '🏆', reward: 'Exclusive Badge' },
];

export default function InviteFriends() {
  const { profile } = useAuth();
  const { data: stats, isLoading: statsLoading } = useInviteStats();
  const { data: badges } = useUserBadges();
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  
  const inviteUrl = profile?.username ? getInviteUrl(profile.username) : '';
  
  const handleCopy = async () => {
    if (!inviteUrl) return;
    
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      analytics.inviteLinkCopied();
      toast.success('Invite link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };
  
  const handleShare = async () => {
    if (!inviteUrl) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join me on VYBE',
          text: 'Check out VYBE - the social app for creators!',
          url: inviteUrl,
        });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };
  
  const currentCount = stats?.totalRedemptions || 0;
  const nextMilestone = MILESTONES.find(m => m.count > currentCount) || MILESTONES[MILESTONES.length - 1];
  const progress = Math.min((currentCount / nextMilestone.count) * 100, 100);
  
  // QR code URL
  const qrCodeUrl = inviteUrl 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteUrl)}&bgcolor=1a1a1a&color=ffffff`
    : '';
  
  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-2"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-animated mb-4">
            <Users className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Invite Friends</h1>
          <p className="text-muted-foreground">
            Share VYBE with friends and earn rewards!
          </p>
        </motion.div>
        
        {/* Invite Link Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="liquid-glass-card rounded-2xl p-6 space-y-4"
        >
          <h2 className="font-semibold flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            Your Invite Link
          </h2>
          
          {!profile?.username ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-3 rounded-xl bg-muted/50 font-mono text-sm truncate">
                  {inviteUrl}
                </div>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  className="flex-1 gradient-animated"
                  onClick={handleShare}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share Link
                </Button>
                <NFCFriendShare variant="icon" />
                <Button 
                  variant="outline"
                  size="icon"
                  onClick={() => setShowQR(!showQR)}
                >
                  <QrCode className="h-4 w-4" />
                </Button>
              </div>
              
              {showQR && qrCodeUrl && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex justify-center pt-4"
                >
                  <div className="p-4 bg-white rounded-xl">
                    <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
                  </div>
                </motion.div>
              )}
            </>
          )}
        </motion.div>
        
        {/* Progress Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="liquid-glass-card rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Reward Progress
            </h2>
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              {currentCount} invited
            </Badge>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Next reward: {nextMilestone.badge}
              </span>
              <span className="font-medium">
                {currentCount}/{nextMilestone.count}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          
          {/* Milestones */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            {MILESTONES.map((milestone) => {
              const achieved = currentCount >= milestone.count;
              return (
                <div
                  key={milestone.count}
                  className={`p-3 rounded-xl text-center transition-all ${
                    achieved 
                      ? 'bg-primary/20 border border-primary/30' 
                      : 'bg-muted/30 opacity-60'
                  }`}
                >
                  <div className="text-2xl mb-1">{milestone.icon}</div>
                  <p className="text-xs font-medium">{milestone.badge}</p>
                  <p className="text-[10px] text-muted-foreground">{milestone.count} invites</p>
                </div>
              );
            })}
          </div>
        </motion.div>
        
        {/* Global Leaderboard */}
        <InviteLeaderboard />
        
        {/* Badges Earned */}
        {badges && badges.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="liquid-glass-card rounded-2xl p-6 space-y-4"
          >
            <h2 className="font-semibold flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              Your Badges
            </h2>
            
            <div className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <Badge 
                  key={badge.id} 
                  variant="outline"
                  className="py-2 px-3 gap-2"
                >
                  {badge.badge_type.includes('invite') && '🎖️'}
                  {badge.badge_name}
                </Badge>
              ))}
            </div>
          </motion.div>
        )}
        
        {/* Recent Invites */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="liquid-glass-card rounded-2xl p-6 space-y-4"
        >
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Friends Who Joined
          </h2>
          
          {statsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : stats?.recentRedemptions && stats.recentRedemptions.length > 0 ? (
            <div className="space-y-3">
              {stats.recentRedemptions.map((redemption: any) => (
                <div 
                  key={redemption.id}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/30 transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={redemption.profile?.avatar_url} />
                    <AvatarFallback>
                      {redemption.profile?.username?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      @{redemption.profile?.username || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Joined {formatDistanceToNow(new Date(redemption.redeemed_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No friends have joined yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Share your link to get started!
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
}
