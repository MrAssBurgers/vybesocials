import { memo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Megaphone, Image, Radio, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Room, RoomType } from '@/hooks/useCommunities';

interface RoomTabsProps {
  rooms: Room[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  unreadCounts?: Record<string, number>;
}

const roomIcons: Record<RoomType, typeof MessageCircle> = {
  chat: MessageCircle,
  announcements: Megaphone,
  media: Image,
  live: Radio,
  qa: HelpCircle,
};

const roomColors: Record<RoomType, string> = {
  chat: 'text-blue-400',
  announcements: 'text-amber-400',
  media: 'text-pink-400',
  live: 'text-green-400',
  qa: 'text-purple-400',
};

export const RoomTabs = memo(function RoomTabs({
  rooms,
  selectedRoomId,
  onSelectRoom,
  unreadCounts = {},
}: RoomTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedTabRef = useRef<HTMLButtonElement>(null);

  // Scroll selected tab into view
  useEffect(() => {
    if (selectedTabRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const tab = selectedTabRef.current;
      const containerRect = container.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      
      if (tabRect.left < containerRect.left || tabRect.right > containerRect.right) {
        tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [selectedRoomId]);

  return (
    <div 
      ref={scrollRef}
      className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-hide border-b border-foreground/5 bg-background/50 backdrop-blur-sm"
    >
      {rooms.map((room) => {
        const isSelected = room.id === selectedRoomId;
        const roomType = (room.room_type || 'chat') as RoomType;
        const Icon = roomIcons[roomType] || MessageCircle;
        const iconColor = roomColors[roomType] || 'text-muted-foreground';
        const unread = unreadCounts[room.id] || 0;

        return (
          <motion.button
            key={room.id}
            ref={isSelected ? selectedTabRef : undefined}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelectRoom(room.id)}
            className={cn(
              "relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap",
              isSelected 
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" 
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
            )}
          >
            <Icon className={cn("h-4 w-4", isSelected ? "text-primary-foreground" : iconColor)} />
            <span>{room.name}</span>
            
            {/* Unread indicator */}
            {unread > 0 && !isSelected && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
});

// Swipeable room content wrapper for mobile
export const SwipeableRoomContent = memo(function SwipeableRoomContent({
  children,
  onSwipeLeft,
  onSwipeRight,
}: {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}) {
  const startX = useRef(0);
  const currentX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = startX.current;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    currentX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = startX.current - currentX.current;
    const threshold = 50;

    if (diff > threshold && onSwipeLeft) {
      onSwipeLeft();
    } else if (diff < -threshold && onSwipeRight) {
      onSwipeRight();
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="flex-1 overflow-hidden"
    >
      {children}
    </div>
  );
});
