import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { RecentMessageUser } from "@/lib/recentMessageUsers";

export function QuickAddRow({
  title,
  users,
  onSelect,
}: {
  title: string;
  users: RecentMessageUser[];
  onSelect: (userId: string) => void;
}) {
  if (!users.length) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => onSelect(u.id)}
            className="flex flex-col items-center gap-1 min-w-[64px]"
            type="button"
          >
            <Avatar className="h-12 w-12">
              <AvatarImage src={u.avatar_url || undefined} alt={u.username} />
              <AvatarFallback>{(u.display_name || u.username).charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="text-[11px] text-foreground truncate max-w-[64px]">
              {u.display_name || u.username}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
