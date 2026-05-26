import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Link2, Send, Lock, Check, X, Copy, Search } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useShareTheme, ThemeShareVisibility } from '@/hooks/useSharedThemes';
import type { ThemeTokens } from '@/hooks/useCustomTheme';
import { useFriends } from '@/hooks/useFriends';
import { ThemePreviewCanvas } from './ThemePreviewCanvas';
import { toast } from 'sonner';

interface ShareMyThemeSheetProps {
  open: boolean;
  onClose: () => void;
  tokens: ThemeTokens;
  initialName?: string;
}

const OPTIONS: Array<{
  key: ThemeShareVisibility;
  title: string;
  blurb: string;
  Icon: typeof Globe;
}> = [
  { key: 'public', title: 'Public', blurb: 'Listed in Browse. Earns likes & saves.', Icon: Globe },
  { key: 'unlisted', title: 'Unlisted link', blurb: 'Only people with the link can equip.', Icon: Link2 },
  { key: 'friends', title: 'Send to friends', blurb: 'Pick friends — sends a DM preview.', Icon: Send },
  { key: 'private', title: 'Private snapshot', blurb: 'Just save to your gallery.', Icon: Lock },
];

export function ShareMyThemeSheet({ open, onClose, tokens, initialName }: ShareMyThemeSheetProps) {
  const [name, setName] = useState(initialName || tokens.themeName || 'My VYBE');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ThemeShareVisibility>('friends');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friendQuery, setFriendQuery] = useState('');
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const share = useShareTheme();
  const { data: friends = [] } = useFriends();

  useEffect(() => {
    if (open) {
      setName(initialName || tokens.themeName || 'My VYBE');
      setDescription('');
      setVisibility('friends');
      setSelectedFriends([]);
      setCreatedLink(null);
    }
  }, [open, initialName, tokens.themeName]);


  const filteredFriends = (friends as any[]).filter((f) => {
    if (!friendQuery.trim()) return true;
    const q = friendQuery.toLowerCase();
    return (
      f.username?.toLowerCase().includes(q) ||
      f.display_name?.toLowerCase().includes(q)
    );
  });

  const toggleFriend = (id: string) => {
    setVisibility('friends');
    setCreatedLink(null);
    setSelectedFriends((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };


  const ctaLabel = (() => {
    if (share.isPending) return 'Sharing…';
    switch (visibility) {
      case 'public': return 'Publish';
      case 'unlisted': return createdLink ? 'Copy link' : 'Create link';
      case 'friends': return selectedFriends.length > 0 ? `Send to ${selectedFriends.length}` : 'Pick friends';
      case 'private': return 'Save snapshot';
    }
  })();

  const handleSubmit = async () => {
    if (visibility === 'unlisted' && createdLink) {
      await navigator.clipboard.writeText(createdLink);
      toast.success('Link copied');
      return;
    }
    if (visibility === 'friends' && selectedFriends.length === 0) return;

    const result = await share.mutateAsync({
      themeName: name.trim() || 'My VYBE',
      themeTokens: tokens,
      description: description.trim() || undefined,
      visibility,
      recipientProfileIds: selectedFriends,
    });

    if (visibility === 'unlisted' && result?.row?.id) {
      const link = `${window.location.origin}/theme/${result.row.id}`;
      setCreatedLink(link);
      try { await navigator.clipboard.writeText(link); } catch {}
    } else {
      onClose();
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-t border-border/40 bg-card p-0 max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Handle + header */}
        <div className="pt-3 pb-2 flex justify-center shrink-0">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="px-5 pb-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold">Share your VYBE</h2>
            <p className="text-xs text-muted-foreground">Pick how you want to send it</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-32 space-y-4 overscroll-contain">
          {/* Preview + name */}
          <div className="space-y-3">
            <ThemePreviewCanvas tokens={tokens} themeName={name} size="md" />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Theme name"
              maxLength={40}
              className="bg-muted/30 border-border/40 rounded-xl"
            />
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your vibe (optional)"
              maxLength={140}
              rows={2}
              className="bg-muted/30 border-border/40 rounded-xl resize-none"
            />
          </div>

          {/* Quick send to friends — always visible */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Send to friends
              </p>
              {selectedFriends.length > 0 && (
                <button
                  onClick={() => setSelectedFriends([])}
                  className="text-[11px] font-semibold text-muted-foreground active:scale-95"
                >
                  Clear ({selectedFriends.length})
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={friendQuery}
                onChange={(e) => setFriendQuery(e.target.value)}
                placeholder="Search friends"
                className="pl-9 bg-muted/30 border-border/40 rounded-xl"
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1 overscroll-contain rounded-2xl bg-muted/10 p-1.5 border border-border/30">
              {(friends as any[]).length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-6">
                  No friends yet — add some to send themes directly.
                </p>
              ) : filteredFriends.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-6">
                  No matches for "{friendQuery}"
                </p>
              ) : (
                filteredFriends.map((f: any) => {
                  const selected = selectedFriends.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleFriend(f.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-2 rounded-xl transition-all active:scale-[0.98]',
                        selected ? 'bg-primary/15' : 'hover:bg-muted/30'
                      )}
                    >
                      <div className="relative">
                        <Avatar className={cn('h-10 w-10 ring-2 transition-all', selected ? 'ring-primary' : 'ring-transparent')}>
                          <AvatarImage src={f.avatar_url || undefined} />
                          <AvatarFallback>{(f.username || '?').charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {selected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary border-2 border-card flex items-center justify-center"
                          >
                            <Check className="h-2.5 w-2.5 text-primary-foreground" />
                          </motion.div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-semibold truncate">{f.display_name || f.username}</p>
                        <p className="text-[11px] text-muted-foreground truncate">@{f.username}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Visibility cards */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">
              Or share another way
            </p>
            {OPTIONS.filter(o => o.key !== 'friends').map(({ key, title, blurb, Icon }) => {
              const active = visibility === key;
              return (
                <button
                  key={key}
                  onClick={() => { setVisibility(key); setCreatedLink(null); setSelectedFriends([]); }}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all active:scale-[0.99]',
                    'border',
                    active
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border/30 bg-muted/20 hover:bg-muted/30'
                  )}
                >
                  <div className={cn(
                    'h-9 w-9 rounded-xl flex items-center justify-center shrink-0',
                    active ? 'bg-primary/20 text-primary' : 'bg-foreground/5 text-muted-foreground'
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-semibold', active && 'text-primary')}>{title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{blurb}</p>
                  </div>
                  {active && (
                    <motion.div
                      layoutId="vis-check"
                      className="h-6 w-6 rounded-full bg-primary flex items-center justify-center shrink-0"
                    >
                      <Check className="h-3.5 w-3.5 text-primary-foreground" />
                    </motion.div>
                  )}
                </button>
              );
            })}
          </div>


          {/* Unlisted link result */}
          {visibility === 'unlisted' && createdLink && (
            <div className="p-3 rounded-2xl bg-primary/10 border border-primary/30 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary shrink-0" />
              <p className="text-xs text-foreground/80 truncate flex-1">{createdLink}</p>
              <button
                onClick={() => { navigator.clipboard.writeText(createdLink); toast.success('Copied'); }}
                className="text-[11px] font-semibold text-primary shrink-0 active:scale-95"
              >
                <Copy className="h-3.5 w-3.5 inline mr-1" />Copy
              </button>
            </div>
          )}
        </div>

        {/* Sticky CTA */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pt-3 bg-card border-t border-border/40">
          <Button
            onClick={handleSubmit}
            disabled={
              share.isPending ||
              (visibility === 'friends' && selectedFriends.length === 0)
            }
            className="w-full h-12 rounded-2xl text-base font-bold bg-gradient-to-r from-primary via-primary to-accent text-primary-foreground shadow-lg shadow-primary/30"
          >
            {ctaLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
