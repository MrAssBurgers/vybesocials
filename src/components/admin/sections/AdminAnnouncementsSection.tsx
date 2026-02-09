import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Megaphone, Trash2, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { CreateAnnouncementDialog } from '@/components/announcements/CreateAnnouncementDialog';

export function AdminAnnouncementsSection() {
  const queryClient = useQueryClient();

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['all-announcements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select(`*, author:profiles!author_id(username, avatar_url)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const deleteAnnouncement = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('dismissed_announcements').delete().eq('announcement_id', id);
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-announcements'] });
      toast.success('Announcement deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const reactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('announcements').update({ is_active: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-announcements'] });
      toast.success('Reactivated');
    },
  });

  return (
    <Card className="liquid-glass">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Megaphone className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Announcements</CardTitle>
              <CardDescription>Manage app announcements</CardDescription>
            </div>
          </div>
          <CreateAnnouncementDialog />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No announcements</div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-4">
              {announcements.map((ann: any) => (
                <div key={ann.id} className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{ann.title}</h3>
                    <Badge variant={ann.is_active ? 'default' : 'secondary'}>
                      {ann.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{ann.content}</p>
                  <p className="text-xs text-muted-foreground">
                    By @{ann.author?.username} • {formatDistanceToNow(new Date(ann.created_at), { addSuffix: true })}
                  </p>
                  <div className="flex gap-2 pt-2">
                    {!ann.is_active && (
                      <Button size="sm" variant="outline" onClick={() => reactivate.mutate(ann.id)}>
                        <RefreshCw className="h-4 w-4 mr-1" /> Reactivate
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteAnnouncement.mutate(ann.id)}>
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
