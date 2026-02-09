import { useAllWarnings } from '@/hooks/useModerationActions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function AdminWarningsSection() {
  const { data: warnings = [], isLoading } = useAllWarnings();

  return (
    <Card className="liquid-glass rounded-3xl border-white/10 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/15">
            <AlertTriangle className="h-5 w-5 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
          </div>
          <div>
            <CardTitle className="text-lg text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Warnings</CardTitle>
            <CardDescription className="text-foreground/70">All issued warnings</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : warnings.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No warnings</div>
        ) : (
          <ScrollArea className="h-[calc(100vh-320px)] min-h-[300px] max-h-[600px] pr-3">
            <div className="space-y-3">
              {warnings.map((warning: any) => (
                <div key={warning.id} className="p-4 rounded-2xl bg-card/60 backdrop-blur-sm border border-white/5 space-y-3 transition-all hover:bg-card/80">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 ring-2 ring-white/10">
                      <AvatarImage src={warning.user?.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary">{warning.user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">@{warning.user?.username}</span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{warning.reason}</p>
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
