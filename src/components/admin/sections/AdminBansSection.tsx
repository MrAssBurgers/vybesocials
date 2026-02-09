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
    <Card className="liquid-glass">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Ban className="h-5 w-5 text-destructive" />
          <div>
            <CardTitle>Active Bans</CardTitle>
            <CardDescription>Currently banned users</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : bans.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No active bans</div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-4">
              {bans.map((ban: any) => (
                <div key={ban.id} className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={ban.user?.avatar_url || ''} />
                        <AvatarFallback>{ban.user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">@{ban.user?.username}</span>
                    </div>
                    <Badge variant={ban.is_permanent ? 'destructive' : 'secondary'}>
                      {ban.is_permanent ? 'Permanent' : 'Temporary'}
                    </Badge>
                  </div>
                  <p className="text-sm">{ban.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {ban.expires_at ? `Expires ${formatDistanceToNow(new Date(ban.expires_at), { addSuffix: true })}` : 'Never expires'}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => unbanUser.mutate(ban.id)}>
                    <Unlock className="h-4 w-4 mr-1" /> Unban
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
