import { motion } from 'framer-motion';
import { Clock, TrendingUp, BarChart3 } from 'lucide-react';
import { useTodayScreenTime, formatScreenTime } from '@/hooks/useScreenTime';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export function ScreenTimeSection() {
  const { user } = useAuth();
  const { data: todaySec } = useTodayScreenTime();

  // Get last 7 days
  const { data: weekData } = useQuery({
    queryKey: ['screen-time-week', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const dates: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
      }
      const { data } = await db
        .from('screen_time_sessions')
        .select('session_date, duration_seconds')
        .eq('user_id', user.id)
        .in('session_date', dates);

      const byDate: Record<string, number> = {};
      dates.forEach(d => byDate[d] = 0);
      (data || []).forEach(s => {
        byDate[s.session_date] = (byDate[s.session_date] || 0) + (s.duration_seconds || 0);
      });

      return dates.map(d => ({
        date: d,
        label: new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' }),
        seconds: byDate[d],
      }));
    },
    enabled: !!user,
  });

  const maxSec = Math.max(...(weekData || []).map(d => d.seconds), 1);
  const weekTotal = (weekData || []).reduce((s, d) => s + d.seconds, 0);

  return (
    <div className="space-y-4">
      {/* Today */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass-card p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 ring-1 ring-primary/20 shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.4)] flex items-center justify-center flex-shrink-0">
            <Clock className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1">Screen Time</h3>
            <p className="text-sm text-muted-foreground">Track your daily VYBE usage</p>
          </div>
        </div>

        <div className="text-center py-4">
          <p className="text-4xl font-bold text-primary">{formatScreenTime(todaySec || 0)}</p>
          <p className="text-sm text-muted-foreground mt-1">Today</p>
        </div>
      </motion.div>

      {/* Weekly chart */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="liquid-glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <h4 className="font-medium text-sm">This Week</h4>
          <span className="ml-auto text-xs text-muted-foreground">{formatScreenTime(weekTotal)} total</span>
        </div>
        <div className="flex items-end gap-1.5 h-24">
          {(weekData || []).map((day, i) => (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full relative" style={{ height: '80px' }}>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max((day.seconds / maxSec) * 100, 4)}%` }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="absolute bottom-0 w-full rounded-t-md bg-primary/60"
                />
              </div>
              <span className="text-[9px] text-muted-foreground">{day.label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
