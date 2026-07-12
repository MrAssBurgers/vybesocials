import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ShieldOff, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { EmptyState } from '@/components/ui/EmptyState';

interface BlockedRow {
  blocked_id: string;
  created_at: string;
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

/**
 * Self-serve management of accounts the user has blocked.
 * Required for App Store 17+ apps and EU DSA transparency.
 */
export function BlockedUsersCard() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['blocked-users-full', profile?.id],
    queryFn: async (): Promise<BlockedRow[]> => {
      if (!profile?.id) return [];
      const { data, error } = await db
        .from('blocked_users')
        .select('blocked_id, created_at, profile:profiles!blocked_users_blocked_id_fkey(id, username, display_name, avatar_url)')
        .eq('blocker_id', profile.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[BlockedUsersCard] load failed', error);
        return [];
      }
      return (data as unknown as BlockedRow[]) || [];
    },
    enabled: !!profile?.id,
    staleTime: 60_000,
  });

  const unblock = useMutation({
    mutationFn: async (blockedId: string) => {
      if (!profile?.id) throw new Error('Not signed in');
      const { error } = await db
        .from('blocked_users')
        .delete()
        .eq('blocker_id', profile.id)
        .eq('blocked_id', blockedId);
      if (error) throw error;
    },
    onSuccess: () => {
      haptics.success();
      toast.success('Unblocked');
      qc.invalidateQueries({ queryKey: ['blocked-users-full', profile?.id] });
      qc.invalidateQueries({ queryKey: ['blocked-user-ids', profile?.id] });
    },
    onError: (err: any) => {
      haptics.error();
      toast.error(err?.message || 'Could not unblock');
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="liquid-glass-card p-4 sm:p-6"
    >
      <h4 className="font-medium mb-1 flex items-center gap-2">
        <ShieldOff className="w-4 h-4 text-muted-foreground" />
        Blocked accounts
      </h4>
      <p className="text-xs text-muted-foreground mb-4">
        These people can't see your posts, message you, or appear in your feeds.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ShieldOff className="h-8 w-8 text-muted-foreground" />}
          title="No blocked accounts"
          description="Anyone you block will show up here so you can manage them later."
          className="py-6"
        />
      ) : (
        <ul className="divide-y divide-border/40">
          {rows.map((row) => {
            const p = row.profile;
            const name = p?.display_name || p?.username || 'Unknown user';
            return (
              <li key={row.blocked_id} className="flex items-center gap-3 py-3">
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarImage src={p?.avatar_url ?? undefined} alt={name} />
                  <AvatarFallback>{(name[0] || '?').toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  {p?.username ? (
                    <Link
                      to={`/u/${p.username}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {name}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-medium">{name}</p>
                  )}
                  {p?.username && (
                    <p className="truncate text-xs text-muted-foreground">@{p.username}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => unblock.mutate(row.blocked_id)}
                  disabled={unblock.isPending}
                  aria-label={`Unblock ${name}`}
                >
                  {unblock.isPending && unblock.variables === row.blocked_id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    'Unblock'
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}
