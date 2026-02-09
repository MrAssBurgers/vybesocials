import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquareWarning, CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export function AdminAppealsSection() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: appeals = [], isLoading } = useQuery({
    queryKey: ['all-appeals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_appeals')
        .select(`*, user:profiles!user_id(id, username, avatar_url, display_name), reviewer:profiles!reviewed_by(username)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const updateAppeal = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      const { error } = await supabase
        .from('content_appeals')
        .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: profile?.id })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-appeals'] });
      toast.success('Appeal updated');
    },
    onError: () => toast.error('Failed to update appeal'),
  });

  return (
    <Card className="liquid-glass rounded-3xl border-white/10 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/15">
            <MessageSquareWarning className="h-5 w-5 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
          </div>
          <div>
            <CardTitle className="text-lg text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Appeals</CardTitle>
            <CardDescription className="text-foreground/70">User content appeals</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : appeals.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No appeals</div>
        ) : (
          <ScrollArea className="h-[calc(100vh-320px)] min-h-[300px] max-h-[600px] pr-3">
            <div className="space-y-3">
              {appeals.map((appeal: any) => (
                <div key={appeal.id} className="p-4 rounded-2xl bg-card/60 backdrop-blur-sm border border-white/5 space-y-3 transition-all hover:bg-card/80">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 ring-2 ring-white/10">
                        <AvatarImage src={appeal.user?.avatar_url || ''} />
                        <AvatarFallback className="bg-primary/20 text-primary">{appeal.user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">@{appeal.user?.username}</span>
                    </div>
                    <Badge variant={appeal.status === 'pending' ? 'destructive' : 'secondary'} className="rounded-full px-3">
                      {appeal.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{appeal.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    Type: {appeal.content_type} • {formatDistanceToNow(new Date(appeal.created_at), { addSuffix: true })}
                  </p>
                  {appeal.status === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="rounded-xl" onClick={() => updateAppeal.mutate({ id: appeal.id, status: 'approved' })}>
                        <CheckCircle className="h-4 w-4 mr-1.5" /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => updateAppeal.mutate({ id: appeal.id, status: 'rejected' })}>
                        <XCircle className="h-4 w-4 mr-1.5" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
