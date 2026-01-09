import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Search, TrendingUp, ShoppingBag, Calendar, 
  Volume2, VolumeX, Bookmark, Users, Sparkles, ChevronRight
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';
import { useConversations } from '@/hooks/useMessages';
import { useFriends } from '@/hooks/useFriends';

export function DesktopRightSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { profile } = useAuth();
  const { data: conversations } = useConversations();
  const { data: friends } = useFriends();
  const [searchQuery, setSearchQuery] = useState('');
  const [isMuted, setIsMuted] = useState(false);

  // Handle Cmd/Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('desktop-search-input')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Get recent conversations with unread messages
  const recentChats = conversations?.slice(0, 3).map(conv => {
    const otherMember = conv.members?.find(m => m.user_id !== profile?.id)?.profile;
    return {
      id: conv.id,
      name: conv.is_group ? conv.name : otherMember?.display_name || otherMember?.username,
      avatar: conv.is_group ? conv.avatar_url : otherMember?.avatar_url,
      lastMessage: conv.last_message?.content,
      hasUnread: conv.unread_count > 0,
      isTyping: false,
    };
  }) || [];

  // Mock data for trending and market (would come from real hooks in production)
  const trendingTags = ['#fyp', '#dance', '#viral', '#gaming', '#music'];
  
  const marketHighlights = [
    { id: '1', title: 'Vintage Camera', price: 120, image: '' },
    { id: '2', title: 'Gaming Setup', price: 450, image: '' },
  ];

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
    <aside className="hidden xl:flex fixed right-0 top-0 h-screen w-[340px] 2xl:w-[380px] flex-col liquid-glass border-l border-border/50 z-40">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Quick Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="desktop-search-input"
              type="search"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-16 h-10 liquid-glass-input"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
              ⌘K
            </kbd>
          </div>

          {/* Friends Online Strip */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Friends Online
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {(friends?.slice(0, 8) || []).map((friend, i) => (
                <Link
                  key={friend?.id || i}
                  to={`/messages/new?user=${friend?.id}`}
                  className="flex-shrink-0"
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10 ring-2 ring-background hover:ring-primary/50 transition-all">
                      <AvatarImage src={friend?.avatar_url || undefined} />
                      <AvatarFallback className="text-xs bg-gradient-to-br from-pink-500 to-purple-500">
                        {friend?.username?.[0]?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <OnlineIndicator isOnline={true} size="sm" />
                  </div>
                </Link>
              ))}
              {(!friends || friends.length === 0) && (
                <p className="text-xs text-muted-foreground">No friends online</p>
              )}
            </div>
          </div>

          <Separator className="bg-border/50" />

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
              {recentChats.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No recent chats</p>
              )}
            </div>
          </div>

          <Separator className="bg-border/50" />

          {/* Trending Now */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Trending
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {trendingTags.map((tag) => (
                <Link key={tag} to={`/explore?q=${encodeURIComponent(tag)}`}>
                  <Badge variant="secondary" className="hover:bg-primary/20 transition-colors cursor-pointer">
                    {tag}
                  </Badge>
                </Link>
              ))}
            </div>
            {/* Trending clip card placeholder */}
            <div className="aspect-video rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">Trending Clip</span>
            </div>
          </div>

          <Separator className="bg-border/50" />

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
            <div className="space-y-2">
              {marketHighlights.map((item) => (
                <Link
                  key={item.id}
                  to={`/listing/${item.id}`}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-sidebar-accent/30 transition-all"
                >
                  <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.title}</p>
                    <p className="text-xs text-primary font-semibold">${item.price}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <Separator className="bg-border/50" />

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
            <div className="p-3 rounded-xl liquid-glass-subtle">
              <p className="font-medium text-sm">Community Meetup</p>
              <p className="text-xs text-muted-foreground mt-0.5">In 3 days</p>
              <Badge variant="outline" className="mt-2 text-[10px]">
                RSVP'd
              </Badge>
            </div>
          </div>

          {/* Context Card */}
          {contextCard && (
            <>
              <Separator className="bg-border/50" />
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
