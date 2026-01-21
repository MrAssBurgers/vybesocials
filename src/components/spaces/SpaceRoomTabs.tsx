/**
 * SpaceRoomTabs - Horizontal swipeable room tabs for a Space
 * Replaces nested channel trees with a simple tab interface
 */

import { memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, 
  Megaphone, 
  Image, 
  Radio, 
  HelpCircle,
  Hash 
} from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export type RoomType = 'chat' | 'announcements' | 'media' | 'live' | 'qa' | 'members';

interface SpaceRoomTabsProps {
  activeRoom: RoomType;
  onRoomChange: (room: RoomType) => void;
  enabledRooms?: RoomType[];
  unreadCounts?: Partial<Record<RoomType, number>>;
  className?: string;
}

const roomConfig: Record<RoomType, { icon: typeof MessageSquare; label: string; color: string }> = {
  chat: { 
    icon: MessageSquare, 
    label: 'Chat',
    color: 'from-primary to-primary/70'
  },
  announcements: { 
    icon: Megaphone, 
    label: 'Announcements',
    color: 'from-yellow-500 to-yellow-400'
  },
  media: { 
    icon: Image, 
    label: 'Media',
    color: 'from-purple-500 to-purple-400'
  },
  live: { 
    icon: Radio, 
    label: 'Live',
    color: 'from-red-500 to-red-400'
  },
  qa: { 
    icon: HelpCircle, 
    label: 'Q&A',
    color: 'from-cyan-500 to-cyan-400'
  },
  members: { 
    icon: Hash, 
    label: 'Members',
    color: 'from-emerald-500 to-emerald-400'
  },
};

const defaultRooms: RoomType[] = ['chat', 'announcements', 'media', 'live'];

export const SpaceRoomTabs = memo(function SpaceRoomTabs({
  activeRoom,
  onRoomChange,
  enabledRooms = defaultRooms,
  unreadCounts = {},
  className,
}: SpaceRoomTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className={cn("relative", className)}>
      {/* Fade edges for scroll indication */}
      <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      
      <ScrollArea className="w-full" ref={scrollRef}>
        <div className="flex items-center gap-2 px-4 py-3">
          {enabledRooms.map((room) => {
            const config = roomConfig[room];
            const isActive = activeRoom === room;
            const unread = unreadCounts[room] || 0;
            const Icon = config.icon;

            return (
              <motion.button
                key={room}
                onClick={() => onRoomChange(room)}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2.5 rounded-full font-medium text-sm whitespace-nowrap transition-all",
                  isActive
                    ? "text-white shadow-lg"
                    : "text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted"
                )}
              >
                {/* Active background */}
                {isActive && (
                  <motion.div
                    layoutId="activeRoomBg"
                    className={cn(
                      "absolute inset-0 rounded-full bg-gradient-to-r",
                      config.color
                    )}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                
                <Icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10">{config.label}</span>
                
                {/* Unread badge */}
                {unread > 0 && !isActive && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="relative z-10 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center"
                  >
                    {unread > 99 ? '99+' : unread}
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>
    </div>
  );
});
