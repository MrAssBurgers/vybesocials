import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  TrendingUp, ShoppingBag, Calendar, 
  Volume2, VolumeX, Bookmark, Users, Sparkles, ChevronRight,
  MessageCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';
import { useConversations, useCreateConversation } from '@/hooks/useMessages';
import { useFriends } from '@/hooks/useFriends';
import { useEvents } from '@/hooks/useEvents';
import { useListings } from '@/hooks/useMarketplace';
import { useUsersOnlineStatus } from '@/hooks/usePresence';
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
  const { profile } = useAuth();
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
        isTyping: false,
      };
    });
  }, [conversations, profile?.id]);

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
        title: 'Current Sound',
        icon: isMuted ? VolumeX : Volume2,
        action: () => setIsMuted(!isMuted),
        actionLabel: isMuted ? 'Unmute' : 'Mute',
      };
    }
    if (location.pathname === '/market' || location.pathname.startsWith('/market')) {
      return {
        title: 'Saved Listings',
        icon: Bookmark,
        link: '/market?filter=saved',
      };
    }
    if (location.pathname === '/events' || location.pathname.startsWith('/events')) {
      return {
        title: 'Your RSVPs',
        icon: Calendar,
        link: '/events?filter=rsvp',
      };
    }
    if (location.pathname === '/explore' || location.pathname.startsWith('/explore')) {
      return {
        title: 'Suggested Creators',
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
        <div className="p-3 space-y-3">

          {/* Online Friends Strip */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Online Friends ({onlineFriends.length})
              </span>
            </div>
            {friendsLoading ? (
              <div className="flex gap-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                ))}
              </div>
            ) : onlineFriends.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {onlineFriends.slice(0, 8).map((friend, i) => (
                  <OnlineFriendAvatar key={friend?.id || i} friend={friend} />
                ))}
              </div>
            ) : friends && friends.length > 0 ? (
              <div className="p-3 rounded-xl liquid-glass-subtle text-center">
                <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">No friends online</p>
              </div>
            ) : (
              <div className="p-3 rounded-xl liquid-glass-subtle text-center">
                <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">No friends yet</p>
              </div>
            )}
          </div>

          {/* Spacer instead of harsh line */}
          <div className="h-px" />

          {/* Active Chats Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Chats
              </span>
              <Link to="/messages" className="text-xs text-primary hover:underline">
                View all
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
                      <p className="font-medium text-sm truncate">{chat.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {chat.isTyping ? (
                          <span className="text-primary flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> typing...
                          </span>
                        ) : (
                          chat.lastMessage || 'No messages yet'
                        )}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl liquid-glass-subtle text-center">
                <MessageCircle className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">No chats yet</p>
              </div>
            )}
          </div>

          <div className="h-px" />

          {/* Trending Now */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Trending
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
                <ShoppingBag className="h-3 w-3" /> Market
              </span>
              <Link to="/market" className="text-xs text-primary hover:underline">
                Browse
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
                        {item.price === 0 ? 'Free' : `$${item.price}`}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl liquid-glass-subtle text-center">
                <ShoppingBag className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">No listings yet</p>
              </div>
            )}
          </div>

          <div className="h-px" />

          {/* Upcoming Events */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Upcoming
              </span>
              <Link to="/events" className="text-xs text-primary hover:underline">
                See all
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
                    <p className="font-medium text-sm truncate">{event.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(event.start_time), { addSuffix: true })}
                    </p>
                    {event.user_rsvp === 'going' && (
                      <Badge variant="outline" className="mt-2 text-[10px]">
                        RSVP'd
                      </Badge>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl liquid-glass-subtle text-center">
                <Calendar className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">No upcoming events</p>
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
    </aside>
  );
}
