import { useAllBans, useUnbanUser } from '@/hooks/useModerationActions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Ban, Unlock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function AdminBansSection() {
  const { data: bans = [], isLoading } = useAllBans();
  const unbanUser = useUnbanUser();

  return (
    <Card className="liquid-glass rounded-3xl border-white/10 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-destructive/15">
            <Ban className="h-5 w-5 text-destructive drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
          </div>
          <div>
            <CardTitle className="text-lg text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Active Bans</CardTitle>
            <CardDescription className="text-foreground/70">Currently banned users</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : bans.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No active bans</div>
        ) : (
          <ScrollArea className="h-[calc(100vh-320px)] min-h-[300px] max-h-[600px] pr-3">
            <div className="space-y-3">
              {bans.map((ban: any) => (
                <div key={ban.id} className="p-4 rounded-2xl bg-card/60 backdrop-blur-sm border border-white/5 space-y-3 transition-all hover:bg-card/80">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 ring-2 ring-white/10">
                        <AvatarImage src={ban.user?.avatar_url || ''} />
                        <AvatarFallback className="bg-destructive/20 text-destructive">{ban.user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">@{ban.user?.username}</span>
                    </div>
                    <Badge variant={ban.is_permanent ? 'destructive' : 'secondary'} className="rounded-full px-3">
                      {ban.is_permanent ? 'Permanent' : 'Temporary'}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{ban.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {ban.expires_at ? `Expires ${formatDistanceToNow(new Date(ban.expires_at), { addSuffix: true })}` : 'Never expires'}
                  </p>
                  <Button size="sm" variant="outline" className="rounded-xl mt-1" onClick={() => unbanUser.mutate(ban.id)}>
                    <Unlock className="h-4 w-4 mr-1.5" /> Unban
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
