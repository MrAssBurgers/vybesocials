import { useMemo, useState } from 'react';
import { Search, UserRound, X } from 'lucide-react';
import { useFriends } from '@/hooks/useFriends';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface PersonTagOption {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

interface PersonTagPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  max?: number;
}

/** Minimal person-tag picker for create/edit — not comment-style mentions. */
export function PersonTagPicker({
  selectedIds,
  onChange,
  className,
  max = 10,
}: PersonTagPickerProps) {
  const { data: friends = [] } = useFriends();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (friends as PersonTagOption[])
      .filter((f) => f.id && f.username)
      .filter((f) => {
        if (!q) return true;
        return (
          f.username.toLowerCase().includes(q) ||
          (f.display_name || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 20);
  }, [friends, query]);

  const selected = useMemo(
    () =>
      (friends as PersonTagOption[]).filter((f) => selectedIds.includes(f.id)),
    [friends, selectedIds],
  );

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
      return;
    }
    if (selectedIds.length >= max) return;
    onChange([...selectedIds, id]);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 text-left text-sm"
        onClick={() => setOpen((v) => !v)}
      >
        <UserRound className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-muted-foreground">
          {selected.length ? `Tagged ${selected.length} people` : 'Tag people'}
        </span>
      </button>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
            >
              @{p.username}
              <button type="button" onClick={() => toggle(p.id)} aria-label={`Remove ${p.username}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="rounded-xl border border-border/50 bg-card p-2 shadow-sm">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search friends"
              className="h-9 pl-8"
            />
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {options.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">No friends found</p>
            )}
            {options.map((p) => {
              const isOn = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/60',
                    isOn && 'bg-primary/10',
                  )}
                >
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={p.avatar_url || undefined} />
                    <AvatarFallback>{p.username.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p.display_name || p.username}
                    <span className="ml-1 text-xs text-muted-foreground">@{p.username}</span>
                  </span>
                  {isOn && <span className="text-xs font-medium text-primary">Tagged</span>}
                </button>
              );
            })}
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-1 w-full" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
