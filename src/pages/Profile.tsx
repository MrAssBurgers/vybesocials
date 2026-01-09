import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Grid, Film, Bookmark, Camera, MessageCircle } from 'lucide-react';
import { useProfileByUsername, useFollow, useUpdateAvatar } from '@/hooks/useProfile';
import { usePosts } from '@/hooks/usePosts';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { FriendButton } from '@/components/friends/FriendButton';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useCreateConversation } from '@/hooks/useMessages';
import { ModeratorActionsMenu } from '@/components/moderation/ModeratorActionsMenu';

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { profile: currentProfile } = useAuth();
  const { data: profile, isLoading } = useProfileByUsername(username!);
  const { data: posts } = usePosts(undefined, profile?.id);
  const follow = useFollow();
  const updateAvatar = useUpdateAvatar();
  const createConversation = useCreateConversation();
  const [activeTab, setActiveTab] = useState('posts');

  const isOwnProfile = currentProfile?.username === username;

  const handleFollow = async () => {
    if (!profile) return;
    
    try {
      await follow.mutateAsync({
        targetId: profile.id,
        isFollowing: profile.is_following,
      });
      toast.success(profile.is_following ? 'Unfollowed' : 'Following!');
    } catch (error) {
      toast.error('Something went wrong');
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await updateAvatar.mutateAsync(file);
      toast.success('Avatar updated!');
    } catch (error) {
      toast.error('Failed to update avatar');
    }
  };

  const handleMessage = async () => {
    if (!profile) return;
    try {
      const conversation = await createConversation.mutateAsync({
        memberIds: [profile.id],
      });
      navigate(`/messages/${conversation.id}`);
    } catch (error) {
      toast.error('Failed to start conversation');
    }
  };

  const gridPosts = posts?.filter((p) => p.type === 'post' || p.type === 'video') || [];
  const shortPosts = posts?.filter((p) => p.type === 'short') || [];

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center gap-8 mb-8">
            <Skeleton className="h-32 w-32 rounded-full" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96">
          <p className="text-4xl mb-4">😕</p>
          <p className="text-muted-foreground">User not found</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row items-center gap-8 mb-8"
        >
          {/* Avatar */}
          <div className="relative">
            <div className="story-ring p-1">
              <Avatar className="h-32 w-32 border-4 border-background">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-4xl bg-secondary">
                  {profile.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            {isOwnProfile && (
              <label className="absolute bottom-0 right-0 p-2 rounded-full bg-primary cursor-pointer hover:bg-primary/90 transition-colors">
                <Camera className="h-5 w-5 text-primary-foreground" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  @{profile.username}
                  {isOwner(profile.username) && <OwnerBadge />}
                </h1>
                {!isOwnProfile && (
                  <ModeratorActionsMenu
                    userId={profile.id}
                    username={profile.username}
                  />
                )}
              </div>
              {isOwnProfile ? (
                <Link to="/settings">
                  <Button variant="secondary" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Edit Profile
                  </Button>
                </Link>
              ) : (
                <div className="flex gap-2">
                  <FriendButton userId={profile.id} size="sm" />
                  <Button
                    variant={profile.is_following ? 'secondary' : 'gradient'}
                    size="sm"
                    onClick={handleFollow}
                    disabled={follow.isPending}
                  >
                    {profile.is_following ? 'Following' : 'Follow'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMessage}
                    disabled={createConversation.isPending}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex justify-center md:justify-start gap-8 mb-4">
              <div className="text-center">
                <p className="font-bold text-xl">{profile.post_count}</p>
                <p className="text-sm text-muted-foreground">posts</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-xl">{profile.follower_count}</p>
                <p className="text-sm text-muted-foreground">followers</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-xl">{profile.following_count}</p>
                <p className="text-sm text-muted-foreground">following</p>
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="text-muted-foreground max-w-md">{profile.bio}</p>
            )}
          </div>
        </motion.div>

        {/* Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full mb-6 bg-secondary">
            <TabsTrigger value="posts" className="flex-1 gap-2">
              <Grid className="h-4 w-4" />
              Posts
            </TabsTrigger>
            <TabsTrigger value="shorts" className="flex-1 gap-2">
              <Film className="h-4 w-4" />
              Shorts
            </TabsTrigger>
            {isOwnProfile && (
              <TabsTrigger value="saved" className="flex-1 gap-2">
                <Bookmark className="h-4 w-4" />
                Saved
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="posts">
            {gridPosts.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {gridPosts.map((post) => (
                  <Link key={post.id} to={`/p/${post.id}`} className="relative group">
                    <div className="aspect-square overflow-hidden bg-muted">
                      {post.type === 'video' ? (
                        <video src={post.media_url} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={post.media_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                      <span className="font-semibold">❤️ {post.like_count}</span>
                      <span className="font-semibold">💬 {post.comment_count}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-4xl mb-4">📷</p>
                <p className="text-muted-foreground">No posts yet</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="shorts">
            {shortPosts.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {shortPosts.map((post) => (
                  <Link key={post.id} to={`/p/${post.id}`} className="relative group">
                    <div className="aspect-[9/16] overflow-hidden bg-muted">
                      <video src={post.media_url} className="w-full h-full object-cover" muted />
                    </div>
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                      <span className="font-semibold">❤️ {post.like_count}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-4xl mb-4">🎬</p>
                <p className="text-muted-foreground">No shorts yet</p>
              </div>
            )}
          </TabsContent>

          {isOwnProfile && (
            <TabsContent value="saved">
              <div className="text-center py-12">
                <p className="text-4xl mb-4">🔖</p>
                <p className="text-muted-foreground">Your saved posts will appear here</p>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
