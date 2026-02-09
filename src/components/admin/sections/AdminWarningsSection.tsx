import { useAllWarnings } from '@/hooks/useModerationActions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function AdminWarningsSection() {
  const { data: warnings = [], isLoading } = useAllWarnings();

  return (
    <Card className="liquid-glass">
      <CardHeader>
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Warnings</CardTitle>
            <CardDescription>All issued warnings</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : warnings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No warnings</div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-4">
              {warnings.map((warning: any) => (
                <div key={warning.id} className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={warning.user?.avatar_url || ''} />
                      <AvatarFallback>{warning.user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">@{warning.user?.username}</span>
                  </div>
                  <p className="text-sm">{warning.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(warning.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
