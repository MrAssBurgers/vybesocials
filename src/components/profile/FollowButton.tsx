import { useEffect, useRef } from 'react';
import { Clock3, Plus, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFollowAuthority } from '@/hooks/useFollowAuthority';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';

export function FollowButton({ targetId, className, compact = false, enabled = true }: { targetId: string; className?: string; compact?: boolean; enabled?: boolean }) {
  const { ready, profile, guard, query, mutation } = useFollowAuthority(enabled ? targetId : undefined);
  const busy = useRef(false);
  const alive = useRef(true); const currentTarget = useRef(targetId); currentTarget.current = targetId;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = () => { guard(); if (!alive.current || currentTarget.current !== targetId) throw new Error('This profile view changed.'); };
  if (!ready || profile?.id === targetId) return null;
  const state = query.data?.state;
  const label = query.isError ? 'Retry follow status' : query.isLoading ? 'Loading follow status' : state === 'pending' ? 'Cancel request'
    : state === 'following' ? 'Unfollow' : query.data?.privateAccount ? 'Request to follow' : 'Follow';
  const change = async (event: React.MouseEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (busy.current) return;
    if (query.isError) { void query.refetch(); return; }
    if (!query.data) return;
    busy.current = true;
    try {
      current(); const saved = query.data;
      const result = await mutation.mutateAsync(saved.state === 'none' ? { action: 'request', targetId, revision: saved.revision }
        : { action: 'unfollow', relationshipId: saved.relationshipId, revision: saved.revision });
      current(); haptics.success();
      toast.success(result.state === 'pending' ? 'Follow request sent' : result.state === 'following' ? 'Following' : 'Follow removed');
    } catch (error) {
      try { current(); } catch { return; }
      toast.error(error instanceof Error ? error.message : 'The change was not confirmed. Try again.'); void query.refetch();
    } finally { busy.current = false; }
  };
  return <Button type="button" variant={state === 'none' ? 'default' : 'secondary'} aria-label={label} title={label}
    disabled={!enabled || mutation.isPending || query.isLoading || (!query.data && !query.isError) || !!query.data?.blocked} onClick={change}
    className={cn('min-h-11 rounded-full transition-[color,background-color,transform] active:scale-95 motion-reduce:transform-none', compact ? 'h-11 w-11 p-0' : 'gap-2 px-5', className)}>
    {state === 'pending' ? <Clock3 className="h-4 w-4" /> : state === 'following' ? <UserCheck className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
    {!compact && (mutation.isPending ? 'Saving…' : query.isLoading ? 'Loading…' : query.isError ? 'Retry' : state === 'pending' ? 'Requested' : state === 'following' ? 'Following' : query.data?.blocked ? 'Unavailable' : label)}
  </Button>;
}
