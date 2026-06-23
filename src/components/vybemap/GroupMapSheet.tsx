import { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Plus, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { MapGroupMap } from '@/lib/vybemap/types';
import { cn } from '@/lib/utils';

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
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2000] bg-black/40" onClick={onClose} />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="fixed inset-x-0 bottom-0 z-[2001] max-h-[80vh] overflow-y-auto rounded-t-3xl bg-black/95 border-t border-white/10 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            <h2 className="text-lg font-bold text-white">Squad Maps</h2>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-white/45 mb-4 leading-relaxed">
          Shared live maps for your crew — better than Snap&apos;s group view. Toggle <strong>Squad Maps</strong> in layers to see everyone together.
        </p>

        <div className="space-y-2 mb-4">
          {groups.length === 0 ? (
            <p className="text-sm text-white/40 py-4 text-center">No squad maps yet — create one below.</p>
          ) : (
            groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onSelect(g)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/8 text-left"
              >
                <span className="text-2xl">{g.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{g.name}</p>
                  <p className="text-[10px] text-white/40">{g.member_count ?? 1} on map</p>
                </div>
                <Users className="h-4 w-4 text-white/30 shrink-0" />
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
                  emoji === e ? 'bg-violet-500/40 ring-2 ring-violet-400' : 'bg-white/5',
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
            className="w-full h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-sm text-white placeholder:text-white/35 outline-none mb-2"
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
          <button type="button" onClick={onJoinFriendSquad} className="mt-3 w-full py-2 text-xs text-white/40">
            Invite friends from chat →
          </button>
        )}
      </motion.div>
    </>
  );
}
