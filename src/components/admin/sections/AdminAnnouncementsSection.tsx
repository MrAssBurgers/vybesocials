import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { isStaffQueryEnabled } from '@/lib/adminAccess';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Megaphone, Trash2, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { CreateAnnouncementDialog } from '@/components/announcements/CreateAnnouncementDialog';
import { EditAnnouncementDialog } from '@/components/announcements/EditAnnouncementDialog';

export function AdminAnnouncementsSection() {
  const { user, authReady } = useAuth();
  const profileId = useAuthProfileId();
  const staffQueriesEnabled = isStaffQueryEnabled(authReady, user, profileId);
  const queryClient = useQueryClient();

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['all-announcements'],
    queryFn: async () => {
      const { data, error } = await db
        .from('announcements')
        .select(`*, author:profiles!author_id(username, avatar_url)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: staffQueriesEnabled,
    networkMode: 'always',
    placeholderData: (prev) => prev,
  });

  const deleteAnnouncement = useMutation({
    mutationFn: async (id: string) => {
      await db.from('dismissed_announcements').delete().eq('announcement_id', id);
      const { error } = await db.from('announcements').delete().eq('id', id);
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
      const { error } = await db.from('announcements').update({ is_active: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-announcements'] });
      toast.success('Reactivated');
    },
  });

  return (
    <Card className="liquid-glass rounded-3xl border-white/10 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-primary/15">
              <Megaphone className="h-5 w-5 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
            </div>
            <div>
              <CardTitle className="text-lg text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Announcements</CardTitle>
              <CardDescription className="text-foreground/70">Manage app announcements</CardDescription>
            </div>
          </div>
          <CreateAnnouncementDialog />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && announcements.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No announcements</div>
        ) : (
          <ScrollArea className="h-[calc(100vh-320px)] min-h-[300px] max-h-[600px] pr-3">
            <div className="space-y-3">
              {announcements.map((ann: any) => (
                <div key={ann.id} className="p-4 rounded-2xl bg-card/60 backdrop-blur-sm border border-white/5 space-y-3 transition-all hover:bg-card/80">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{ann.title}</h3>
                    <Badge variant={ann.is_active ? 'default' : 'secondary'} className="rounded-full px-3">
                      {ann.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  {/* Media thumbnail */}
                  {ann.image_url && (
                    ann.media_type === 'video' ? (
                      <video src={ann.image_url} muted className="w-full max-h-32 object-cover rounded-xl border border-border" />
                    ) : (
                      <img src={ann.image_url} alt="" className="w-full max-h-32 object-cover rounded-xl border border-border" />
                    )
                  )}

                  <p className="text-sm text-foreground/80 leading-relaxed">{ann.content}</p>
                  <p className="text-xs text-muted-foreground">
                    By @{ann.author?.username} • {formatDistanceToNow(new Date(ann.created_at), { addSuffix: true })}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <EditAnnouncementDialog announcement={ann} />
                    {!ann.is_active && (
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => reactivate.mutate(ann.id)}>
                        <RefreshCw className="h-4 w-4 mr-1.5" /> Reactivate
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="rounded-xl text-destructive hover:text-destructive" onClick={() => deleteAnnouncement.mutate(ann.id)}>
                      <Trash2 className="h-4 w-4 mr-1.5" /> Delete
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
