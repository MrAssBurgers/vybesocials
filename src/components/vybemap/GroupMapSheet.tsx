import { useState } from 'react';
import { Users, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { MapGroupMap } from '@/lib/vybemap/types';
import { cn } from '@/lib/utils';
import { MapLiquidSheet } from '@/components/vybemap/MapLiquidSheet';

const EMOJIS = ['🗺️', '🔥', '✨', '🎉', '🌴', '🏙️', '⚡', '💜'];

interface GroupMapSheetProps {
  groups: MapGroupMap[];
  onClose: () => void;
  onCreate: (input: { name: string; emoji: string }) => Promise<void>;
  onSelect: (group: MapGroupMap) => void;
  onJoinFriendSquad?: () => void;
}

export function GroupMapSheet({ groups, onClose, onCreate, onSelect, onJoinFriendSquad }: GroupMapSheetProps) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🗺️');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = name.trim();
    if (!n) {
      toast.error('Name your squad map');
      return;
    }
    setBusy(true);
    try {
      await onCreate({ name: n, emoji });
      setName('');
      toast.success('Squad map created!');
    } catch {
      toast.error('Could not create squad map');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MapLiquidSheet
      onClose={onClose}
      maxHeight="80vh"
      title={
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-400" />
          <h2 className="text-lg font-bold text-foreground">Squad Maps</h2>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        Shared live maps for your crew — better than Snap&apos;s group view. Toggle <strong>Squad Maps</strong> in layers to see everyone together.
      </p>

      <div className="space-y-2 mb-4">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No squad maps yet — create one below.</p>
        ) : (
          groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelect(g)}
              className="w-full flex items-center gap-3 p-3 rounded-xl liquid-glass-subtle border border-border/40 text-left"
            >
              <span className="text-2xl">{g.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground truncate">{g.name}</p>
                <p className="text-[10px] text-muted-foreground">{g.member_count ?? 1} on map</p>
              </div>
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))
        )}
      </div>

      <div className="rounded-2xl border border-violet-500/25 bg-violet-500/10 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-300 mb-2">New squad map</p>
        <div className="flex gap-1.5 mb-2 overflow-x-auto scrollbar-hide">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={cn(
                'shrink-0 h-9 w-9 rounded-xl text-lg',
                emoji === e ? 'bg-violet-500/40 ring-2 ring-violet-400' : 'bg-card/40',
              )}
            >
              {e}
            </button>
          ))}
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Friday night crew, road trip…"
          maxLength={40}
          className="w-full h-10 rounded-xl bg-card/50 border border-border/50 px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none mb-2"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Create squad map
        </button>
      </div>

      {onJoinFriendSquad && (
        <button type="button" onClick={onJoinFriendSquad} className="mt-3 w-full py-2 text-xs text-muted-foreground">
          Invite friends from chat →
        </button>
      )}
    </MapLiquidSheet>
  );
}
