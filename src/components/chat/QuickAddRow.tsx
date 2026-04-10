import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OnlineIndicator } from "@/components/ui/OnlineIndicator";
import type { RecentMessageUser } from "@/lib/recentMessageUsers";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  show: { 
    opacity: 1, 
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 400, damping: 25 }
  },
};

export interface QuickAddUser extends RecentMessageUser {
  isOnline?: boolean;
}

export function QuickAddRow({
  title,
  users,
  onSelect,
  showOnlineIndicator = false,
}: {
  title: string;
  users: QuickAddUser[];
  onSelect: (userId: string) => void;
  showOnlineIndicator?: boolean;
}) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // Only hijack if the user is scrolling predominantly horizontally
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        el.scrollLeft += e.deltaX;
      }
      // Never capture vertical scroll — let the page scroll normally
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  if (!users.length) return null;

  return (
    <section className="space-y-2 min-w-0 w-full">
      <motion.div 
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center justify-between"
      >
        <h2 className="text-xs font-medium text-muted-foreground truncate">{title}</h2>
      </motion.div>

      <motion.div 
        ref={scrollRef}
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {users.map((u, i) => (
          <motion.button
            key={u.id}
            variants={itemVariants}
            whileHover={{ scale: 1.1, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate(`/u/${u.username}`)}
            className="flex flex-col items-center gap-1 min-w-[64px]"
            type="button"
          >
            <motion.div
              whileHover={{ rotate: [0, -5, 5, 0] }}
              transition={{ duration: 0.3 }}
              className="relative"
            >
              <Avatar className="h-12 w-12 ring-2 ring-background shadow-md">
                <AvatarImage src={u.avatar_url || undefined} alt={u.username} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                  {(u.display_name || u.username).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {showOnlineIndicator && u.isOnline && (
                <OnlineIndicator isOnline={true} size="sm" className="bottom-0 right-0" />
              )}
            </motion.div>
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.02 }}
              className="text-[11px] text-foreground truncate max-w-[64px]"
            >
              {u.display_name || u.username}
            </motion.span>
          </motion.button>
        ))}
      </motion.div>
    </section>
  );
}
