import { memo, useState } from 'react';
import { Grid, Film, Circle, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostsTab } from './tabs/PostsTab';
import { ClipsTab } from './tabs/ClipsTab';
import { StoriesTab } from './tabs/StoriesTab';

const TABS = [
  { id: 'posts', label: 'Posts', icon: Grid },
  { id: 'clips', label: 'Clips', icon: Film },
  { id: 'stories', label: 'Stories', icon: Circle },
  { id: 'shared', label: 'Shared', icon: Share2 },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface FriendProfileTabsProps {
  profileId: string;
  otherProfileId: string;
  visibility?: Record<string, boolean> | null;
  className?: string;
}

export const FriendProfileTabs = memo(function FriendProfileTabs({
  profileId,
  visibility,
  className,
}: FriendProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('posts');

  const can = (field: string) => visibility?.[field] === true;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex gap-1 p-1 rounded-xl bg-muted/40 border border-white/5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            disabled={!can(id)}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors',
              activeTab === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'posts' && can('posts') && <PostsTab profileId={profileId} />}
      {activeTab === 'posts' && !can('posts') && (
        <p className="text-sm text-muted-foreground text-center py-8">Posts are hidden</p>
      )}

      {activeTab === 'clips' && can('clips') && <ClipsTab profileId={profileId} />}
      {activeTab === 'clips' && !can('clips') && (
        <p className="text-sm text-muted-foreground text-center py-8">Clips are hidden</p>
      )}

      {activeTab === 'stories' && can('stories') && <StoriesTab profileId={profileId} />}
      {activeTab === 'stories' && !can('stories') && (
        <p className="text-sm text-muted-foreground text-center py-8">Stories are hidden</p>
      )}

      {activeTab === 'shared' && <p className="text-sm text-muted-foreground text-center py-8">Shared content is unavailable here.</p>}
    </div>
  );
});
