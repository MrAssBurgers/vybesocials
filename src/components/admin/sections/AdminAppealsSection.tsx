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
    <Card className="liquid-glass">
      <CardHeader>
        <div className="flex items-center gap-3">
          <MessageSquareWarning className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Appeals</CardTitle>
            <CardDescription>User content appeals</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : appeals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No appeals</div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-4">
              {appeals.map((appeal: any) => (
                <div key={appeal.id} className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={appeal.user?.avatar_url || ''} />
                        <AvatarFallback>{appeal.user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">@{appeal.user?.username}</span>
                    </div>
                    <Badge variant={appeal.status === 'pending' ? 'destructive' : 'secondary'}>
                      {appeal.status}
                    </Badge>
                  </div>
                  <p className="text-sm">{appeal.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    Type: {appeal.content_type} • {formatDistanceToNow(new Date(appeal.created_at), { addSuffix: true })}
                  </p>
                  {appeal.status === 'pending' && (
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={() => updateAppeal.mutate({ id: appeal.id, status: 'approved' })}>
                        <CheckCircle className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => updateAppeal.mutate({ id: appeal.id, status: 'rejected' })}>
                        <XCircle className="h-4 w-4 mr-1" /> Reject
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
