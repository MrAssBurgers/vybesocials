import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  TrendingUp, ShoppingBag, Calendar, 
  Volume2, VolumeX, Bookmark, Users, Sparkles, ChevronRight,
  MessageCircle, LogOut
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';
import { TypingIndicator } from '@/components/ui/TypingIndicator';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { useConversations, useCreateConversation } from '@/hooks/useMessages';
import { useFriends } from '@/hooks/useFriends';
import { useEvents } from '@/hooks/useEvents';
import { useListings } from '@/hooks/useMarketplace';
import { useUsersOnlineStatus } from '@/hooks/usePresence';
import { useConversationTyping } from '@/hooks/useConversationTyping';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

// Online friend avatar with click-to-DM functionality - simplified for performance
const OnlineFriendAvatar = memo(function OnlineFriendAvatar({ friend }: { friend: any }) {
  const navigate = useNavigate();
  const createConversation = useCreateConversation();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (!friend?.id || isLoading) return;
    
    setIsLoading(true);
    try {
      const conversation = await createConversation.mutateAsync({ memberIds: [friend.id] });
      navigate(`/messages/${conversation.id}`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to start conversation');
    } finally {
      setIsLoading(false);
    }
  }, [friend?.id, createConversation, navigate, isLoading]);

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className="flex-shrink-0 group relative hover:scale-105 active:scale-95 transition-transform"
    >
      <div className="relative">
        <Avatar className="h-10 w-10 ring-2 ring-background group-hover:ring-primary/50 transition-all">
          <AvatarImage src={friend?.avatar_url || undefined} />
          <AvatarFallback className="text-xs bg-gradient-to-br from-pink-500 to-purple-500">
            {friend?.username?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <OnlineIndicator isOnline={true} size="sm" className="bottom-0 right-0" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-full">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </button>
  );
});

export function DesktopRightSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };
  const { data: conversations, isLoading: conversationsLoading } = useConversations();
  const { data: friends, isLoading: friendsLoading } = useFriends();
  const { data: events, isLoading: eventsLoading } = useEvents({ upcoming: true });
  const { data: listings, isLoading: listingsLoading } = useListings();
  const [isMuted, setIsMuted] = useState(false);


  // Get friend IDs for presence lookup
  const friendIds = useMemo(() => 
    (friends || []).map(f => f?.id).filter(Boolean) as string[],
    [friends]
  );
  
  // Get actual online status for all friends
  const { data: onlineStatusMap } = useUsersOnlineStatus(friendIds);

  // Filter to only show online friends
  const onlineFriends = useMemo(() => {
    if (!friends || !onlineStatusMap) return [];
    return friends.filter(f => f?.id && onlineStatusMap[f.id] === true);
  }, [friends, onlineStatusMap]);

  // Get conversation IDs for typing subscription
  const conversationIds = useMemo(() => 
    (conversations || []).slice(0, 3).map(c => c.id),
    [conversations]
  );
  
  // Subscribe to typing indicators
  const { isTyping: checkTyping } = useConversationTyping(conversationIds);

  // Get recent conversations with unread messages - memoized
  const recentChats = useMemo(() => {
    if (!conversations) return [];
    return conversations.slice(0, 3).map(conv => {
      const otherMember = conv.members?.find(m => m.user_id !== profile?.id)?.profile;
      return {
        id: conv.id,
        name: conv.is_group ? conv.name : otherMember?.display_name || otherMember?.username,
        avatar: conv.is_group ? conv.avatar_url : otherMember?.avatar_url,
        lastMessage: conv.last_message?.content,
        hasUnread: conv.unread_count > 0,
        isTyping: checkTyping(conv.id),
        otherUserId: conv.is_group ? null : otherMember?.id,
        isGroup: conv.is_group,
      };
    });
  }, [conversations, profile?.id, checkTyping]);

  // Get upcoming events (filter for future events) - memoized
  const upcomingEvents = useMemo(() => {
    if (!events) return [];
    const now = new Date();
    return events.filter(e => new Date(e.start_time) > now).slice(0, 2);
  }, [events]);
  
  // Get recent listings - memoized
  const recentListings = useMemo(() => listings?.slice(0, 2) || [], [listings]);

  // Static trending tags (would come from real API in production)
  const trendingTags = ['#fyp', '#dance', '#viral', '#gaming', '#music'];

  // Get context card based on current page
  const getContextCard = () => {
    if (location.pathname === '/clips' || location.pathname.startsWith('/clips')) {
      return {
        title: t('sidebar.currentSound'),
        icon: isMuted ? VolumeX : Volume2,
        action: () => setIsMuted(!isMuted),
        actionLabel: isMuted ? t('sidebar.unmute') : t('sidebar.mute'),
      };
    }
    if (location.pathname === '/market' || location.pathname.startsWith('/market')) {
      return {
        title: t('sidebar.savedListings'),
        icon: Bookmark,
        link: '/market?filter=saved',
      };
    }
    if (location.pathname === '/events' || location.pathname.startsWith('/events')) {
      return {
        title: t('sidebar.yourRsvps'),
        icon: Calendar,
        link: '/events?filter=rsvp',
      };
    }
    if (location.pathname === '/explore' || location.pathname.startsWith('/explore')) {
      return {
        title: t('sidebar.suggestedCreators'),
        icon: Users,
      };
    }
    return null;
  };

  const contextCard = getContextCard();

  return (
    <aside 
      className={cn(
        "hidden lg:flex flex-col sticky top-0 h-screen shrink-0 z-40",
        "w-[240px] 2xl:w-[280px] overflow-hidden",
        "bg-gradient-to-b from-accent/15 via-accent/10 to-primary/20 backdrop-blur-2xl backdrop-saturate-150",
        "border-l border-white/10"
      )}
    >
      <ScrollArea className="flex-1 h-full">
        <div className="p-3 pt-5 space-y-3">

          {/* Online Friends Strip */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                {t('sidebar.online')} ({onlineFriends.length})
              </span>
            </div>
            {friendsLoading ? (
              <div className="flex gap-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                ))}
              </div>
            ) : onlineFriends.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto py-1 pl-0.5 scrollbar-hide">
                {onlineFriends.slice(0, 8).map((friend, i) => (
                  <OnlineFriendAvatar key={friend?.id || i} friend={friend} />
                ))}
              </div>
            ) : friends && friends.length > 0 ? (
              <div className="p-3 rounded-xl liquid-glass-subtle text-center">
                <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">{t('sidebar.noFriendsOnline')}</p>
              </div>
            ) : (
              <div className="p-3 rounded-xl liquid-glass-subtle text-center">
                <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">{t('sidebar.noFriendsYet')}</p>
              </div>
            )}
          </div>

          {/* Spacer instead of harsh line */}
          <div className="h-px" />

          {/* Active Chats Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t('sidebar.recentChats')}
              </span>
              <Link to="/messages" className="text-xs text-primary hover:underline">
                {t('sidebar.viewAll')}
              </Link>
            </div>
            {conversationsLoading ? (
              <div className="space-y-2">
                {[1, 2].map(i => (
                  <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : recentChats.length > 0 ? (
              <div className="space-y-2">
                {recentChats.map((chat) => (
                  <Link
                    key={chat.id}
                    to={`/messages/${chat.id}`}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-sidebar-accent/30 transition-all"
                  >
                    <div className="relative">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={chat.avatar || undefined} />
                        <AvatarFallback className="text-xs bg-secondary">
                          {chat.name?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      {chat.hasUnread && (
                        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-primary rounded-full border-2 border-background" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {chat.otherUserId ? (
                          <StyledUsername
                            userId={chat.otherUserId}
                            username={chat.name || 'Unknown'}
                            displayName={chat.name}
                          />
                        ) : (
                          chat.name
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {chat.isTyping ? (
                          <span className="text-primary flex items-center gap-1">
                            <TypingIndicator size="sm" />
                            <span className="font-medium">{t('sidebar.typing')}</span>
                          </span>
                        ) : (
                          chat.lastMessage || t('sidebar.noMessagesYet')
                        )}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl liquid-glass-subtle text-center">
                <MessageCircle className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">{t('sidebar.noChatsYet')}</p>
              </div>
            )}
          </div>

          <div className="h-px" />

          {/* Music Vibe Quiz Banner */}
          <Link to="/music-quiz" className="block relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 p-4 hover:scale-[1.02] transition-transform group cursor-pointer">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/20 rounded-full blur-2xl -mr-8 -mt-8 group-hover:bg-primary/30 transition-colors" />
            <div className="absolute bottom-0 left-0 w-20 h-20 bg-accent/20 rounded-full blur-2xl -ml-8 -mb-8 group-hover:bg-accent/30 transition-colors" />
            <div className="relative z-10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h4 className="font-bold text-sm bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/80">
                  Find Your Vibe
                </h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Take the music personality quiz
                </p>
              </div>
            </div>
          </Link>

          <div className="h-px" />

          {/* Trending Now */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> {t('sidebar.trending')}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {trendingTags.map((tag) => (
                <Link key={tag} to={`/explore?q=${encodeURIComponent(tag)}`}>
                  <Badge variant="secondary" className="hover:bg-primary/20 transition-colors cursor-pointer">
                    {tag}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>

          <div className="h-px" />

          {/* Market Highlights */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <ShoppingBag className="h-3 w-3" /> {t('sidebar.market')}
              </span>
              <Link to="/market" className="text-xs text-primary hover:underline">
                {t('sidebar.browse')}
              </Link>
            </div>
            {listingsLoading ? (
              <div className="space-y-2">
                {[1, 2].map(i => (
                  <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : recentListings.length > 0 ? (
              <div className="space-y-2">
                {recentListings.map((item) => (
                  <Link
                    key={item.id}
                    to={`/market/${item.id}`}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-sidebar-accent/30 transition-all"
                  >
                    <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex-shrink-0 overflow-hidden">
                      {item.images?.[0] ? (
                        <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg">📦</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.title}</p>
                      <p className="text-xs text-primary font-semibold">
                        {item.price === 0 ? t('sidebar.free') : `$${item.price}`}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl liquid-glass-subtle text-center">
                <ShoppingBag className="h-4 w-4 mx-auto text-foreground/60 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] mb-1" />
                <p className="text-xs text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{t('sidebar.noListingsYet')}</p>
              </div>
            )}
          </div>

          <div className="h-px" />

          {/* Upcoming Events */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                <Calendar className="h-3 w-3 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" /> 
                <span>{t('sidebar.upcoming')}</span>
              </span>
              <Link to="/events" className="text-xs text-primary hover:underline drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                {t('sidebar.seeAll')}
              </Link>
            </div>
            {eventsLoading ? (
              <div className="h-20 rounded-xl bg-muted animate-pulse" />
            ) : upcomingEvents.length > 0 ? (
              <div className="space-y-2">
                {upcomingEvents.map((event) => (
                  <Link
                    key={event.id}
                    to={`/events/${event.id}`}
                    className="block p-3 rounded-xl liquid-glass-subtle hover:bg-sidebar-accent/30 transition-all"
                  >
                    <p className="font-medium text-sm truncate text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{event.title}</p>
                    <p className="text-xs text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] mt-0.5">
                      {formatDistanceToNow(new Date(event.start_time), { addSuffix: true })}
                    </p>
                    {event.user_rsvp === 'going' && (
                      <Badge variant="outline" className="mt-2 text-[10px]">
                        {t('sidebar.rsvpd')}
                      </Badge>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl liquid-glass-subtle text-center">
                <Calendar className="h-4 w-4 mx-auto text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] mb-1" />
                <p className="text-xs text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{t('sidebar.noUpcomingEvents')}</p>
              </div>
            )}
          </div>

          {/* Context Card */}
          {contextCard && (
            <>
              <div className="h-px" />
              <div className="p-3 rounded-xl liquid-glass-subtle">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <contextCard.icon className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">{contextCard.title}</span>
                  </div>
                  {contextCard.action && (
                    <Button variant="ghost" size="sm" onClick={contextCard.action} className="h-7 text-xs">
                      {contextCard.actionLabel}
                    </Button>
                  )}
                  {contextCard.link && (
                    <Link to={contextCard.link}>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Logout Button at Bottom */}
      <div className="p-3" style={{ borderTop: '1px solid transparent', borderImage: 'linear-gradient(90deg, transparent 5%, hsl(var(--border) / 0.25) 50%, transparent 95%) 1' }}>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all">
              <LogOut className="h-4 w-4" />
              <span className="text-sm font-medium">{t('auth.logout')}</span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Log out?</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to log out of your account?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSignOut} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Log out</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </aside>
  );
}
