import { useState, useCallback, memo } from 'react';
import { motion, Reorder } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GripVertical, Eye, EyeOff, Dna, Award, Users, Music, MessageCircle, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useVybeDNA } from '@/hooks/useVybeDNA';
import { useUserStatusById } from '@/hooks/useUserStatus';
import { useUserBadges } from '@/hooks/useBadges';
import { BadgeRow } from '@/components/badges';

export interface BentoBlock {
  id: string;
  label: string;
  icon: any;
  enabled: boolean;
  colSpan: 1 | 2;
  rowSpan: 1 | 2;
}

const DEFAULT_BLOCKS: BentoBlock[] = [
  { id: 'vybe_dna', label: 'VYBE DNA', icon: Dna, enabled: true, colSpan: 2, rowSpan: 1 },
  { id: 'badges', label: 'Badges', icon: Award, enabled: true, colSpan: 1, rowSpan: 1 },
  { id: 'vibe', label: 'Current Vibe', icon: Sparkles, enabled: true, colSpan: 1, rowSpan: 1 },
  { id: 'mutual_friends', label: 'Mutuals', icon: Users, enabled: true, colSpan: 2, rowSpan: 1 },
];

function getStoredBlocks(userId: string): BentoBlock[] {
  try {
    const stored = localStorage.getItem(`vybe_bento_${userId}`);
    if (stored) return JSON.parse(stored);
  } catch {}
  return DEFAULT_BLOCKS;
}

function saveBlocks(userId: string, blocks: BentoBlock[]) {
  try {
    localStorage.setItem(`vybe_bento_${userId}`, JSON.stringify(blocks));
  } catch {}
}

/** Vybe DNA mini card */
function VybeDNABlock({ userId }: { userId: string }) {
  const { data: dna } = useVybeDNA(userId);
  if (!dna) return <p className="text-xs text-muted-foreground">No DNA yet</p>;

  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {(dna.signature_colors || []).slice(0, 3).map((c, i) => (
          <div key={i} className="w-6 h-6 rounded-full shadow-sm" style={{ backgroundColor: c }} />
        ))}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold truncate capitalize">{dna.glyph_pattern || 'wave'}</p>
        <p className="text-[10px] text-muted-foreground">Engagement: {Math.round((dna.engagement_score || 0) * 100)}%</p>
      </div>
    </div>
  );
}

/** Current vibe block */
function VibeBlock({ userId }: { userId: string }) {
  const { data: status } = useUserStatusById(userId);
  if (!status) return <p className="text-xs text-muted-foreground italic">No vibe set</p>;
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl">{status.emoji}</span>
      <span className="text-xs font-medium">{status.text}</span>
    </div>
  );
}

/** Badges block */
function BadgesBlock({ userId }: { userId: string }) {
  const { data: badges } = useUserBadges(userId);
  if (!badges || badges.length === 0) return <p className="text-xs text-muted-foreground">No badges yet</p>;
  return <BadgeRow badges={badges.slice(0, 6) as any} size="sm" />;
}

/** Block content renderer */
function BlockContent({ blockId, userId }: { blockId: string; userId: string }) {
  switch (blockId) {
    case 'vybe_dna': return <VybeDNABlock userId={userId} />;
    case 'badges': return <BadgesBlock userId={userId} />;
    case 'vibe': return <VibeBlock userId={userId} />;
    case 'mutual_friends': return <p className="text-xs text-muted-foreground">Coming soon</p>;
    default: return null;
  }
}

interface ProfileBentoGridProps {
  userId: string;
  isOwnProfile: boolean;
}

export const ProfileBentoGrid = memo(function ProfileBentoGrid({ userId, isOwnProfile }: ProfileBentoGridProps) {
  const [blocks, setBlocks] = useState<BentoBlock[]>(() => getStoredBlocks(userId));
  const [editing, setEditing] = useState(false);

  const enabledBlocks = blocks.filter(b => b.enabled);

  const handleReorder = useCallback((newOrder: BentoBlock[]) => {
    setBlocks(prev => {
      const disabled = prev.filter(b => !b.enabled);
      const updated = [...newOrder, ...disabled];
      saveBlocks(userId, updated);
      return updated;
    });
  }, [userId]);

  const toggleBlock = useCallback((blockId: string) => {
    setBlocks(prev => {
      const updated = prev.map(b => b.id === blockId ? { ...b, enabled: !b.enabled } : b);
      saveBlocks(userId, updated);
      return updated;
    });
  }, [userId]);

  if (enabledBlocks.length === 0 && !isOwnProfile) return null;

  return (
    <div className="space-y-2">
      {isOwnProfile && (
        <div className="flex justify-end">
          <button
            onClick={() => setEditing(!editing)}
            className="text-[10px] text-primary font-medium px-2 py-1 rounded-full hover:bg-primary/10 transition-colors"
          >
            {editing ? 'Done' : 'Edit Layout'}
          </button>
        </div>
      )}

      {editing ? (
        <Reorder.Group axis="y" values={enabledBlocks} onReorder={handleReorder} className="space-y-2">
          {blocks.map((block) => (
            <Reorder.Item key={block.id} value={block} className="list-none">
              <div className={cn(
                "flex items-center gap-2 p-3 rounded-xl border transition-all",
                block.enabled ? "bg-card border-border/30" : "bg-muted/20 border-border/10 opacity-50"
              )}>
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <block.icon className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium flex-1">{block.label}</span>
                <button onClick={() => toggleBlock(block.id)}>
                  {block.enabled ? (
                    <Eye className="h-4 w-4 text-primary" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {enabledBlocks.map((block) => (
            <motion.div
              key={block.id}
              layout
              className={cn(
                "rounded-xl bg-card/80 border border-border/20 p-3 min-h-[60px]",
                block.colSpan === 2 && "col-span-2",
                block.rowSpan === 2 && "row-span-2"
              )}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <block.icon className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{block.label}</span>
              </div>
              <BlockContent blockId={block.id} userId={userId} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
});
