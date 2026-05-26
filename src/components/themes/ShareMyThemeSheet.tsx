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
        className="rounded-t-3xl border-t border-border/40 bg-card p-0 max-h-[92vh] overflow-hidden flex flex-col"
      >
        {/* Handle */}
        <div className="pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-3 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-[17px] font-bold leading-tight">Share your VYBE</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Choose how to send it</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Preview strip — compact */}
        <div className="px-5 pb-3 shrink-0">
          <ThemePreviewCanvas tokens={tokens} themeName={name} size="md" />
        </div>


        {/* Tab bar */}
        <div className="px-3 shrink-0">
          <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-muted/30 border border-border/30">
            {OPTIONS.map(({ key, title, Icon }) => {
              const active = visibility === key;
              const short = key === 'public' ? 'Public' : key === 'unlisted' ? 'Link' : key === 'friends' ? 'Friends' : 'Save';
              return (
                <button
                  key={key}
                  onClick={() => { setVisibility(key); setCreatedLink(null); if (key !== 'friends') setSelectedFriends([]); }}
                  className={cn(
                    'relative h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors',
                    active ? 'text-primary-foreground' : 'text-muted-foreground active:scale-95'
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="tab-pill"
                      className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-accent shadow-md shadow-primary/20"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <Icon className="h-3.5 w-3.5 relative z-10" />
                  <span className="text-[10px] font-semibold relative z-10">{short}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-28 overscroll-contain">
          <AnimatePresence mode="wait">
            {visibility === 'friends' && (
              <motion.div
                key="friends"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-3"
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={friendQuery}
                    onChange={(e) => setFriendQuery(e.target.value)}
                    placeholder="Search friends"
                    className="pl-9 h-10 bg-muted/30 border-border/40 rounded-xl"
                  />
                </div>

                {selectedFriends.length > 0 && (
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-bold text-primary">{selectedFriends.length}</span> selected
                    </p>
                    <button
                      onClick={() => setSelectedFriends([])}
                      className="text-[11px] font-semibold text-muted-foreground active:scale-95"
                    >
                      Clear
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  {(friends as any[]).length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-10">
                      No friends yet — add some to send themes directly.
                    </p>
                  ) : filteredFriends.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-10">
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
                          <div className="relative shrink-0">
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
              </motion.div>
            )}

            {visibility === 'public' && (
              <motion.div
                key="public"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-3"
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Theme name"
                  maxLength={40}
                  className="h-11 bg-muted/30 border-border/40 rounded-xl"
                />
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your vibe (optional)"
                  maxLength={140}
                  rows={3}
                  className="bg-muted/30 border-border/40 rounded-xl resize-none"
                />
                <div className="p-3 rounded-2xl bg-primary/5 border border-primary/20 flex items-start gap-2.5">
                  <Globe className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Listed in the public Browse gallery. Anyone can like, save, or equip it.
                  </p>
                </div>
              </motion.div>
            )}

            {visibility === 'unlisted' && (
              <motion.div
                key="unlisted"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-3"
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Theme name"
                  maxLength={40}
                  className="h-11 bg-muted/30 border-border/40 rounded-xl"
                />
                <div className="p-3 rounded-2xl bg-primary/5 border border-primary/20 flex items-start gap-2.5">
                  <Link2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Only people with the link can view and equip it. Not listed anywhere.
                  </p>
                </div>
                {createdLink && (
                  <div className="p-3 rounded-2xl bg-primary/10 border border-primary/30 flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-xs text-foreground/80 truncate flex-1">{createdLink}</p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(createdLink); toast.success('Copied'); }}
                      className="text-[11px] font-semibold text-primary shrink-0 active:scale-95 flex items-center"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />Copy
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {visibility === 'private' && (
              <motion.div
                key="private"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-3"
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Theme name"
                  maxLength={40}
                  className="h-11 bg-muted/30 border-border/40 rounded-xl"
                />
                <div className="p-3 rounded-2xl bg-primary/5 border border-primary/20 flex items-start gap-2.5">
                  <Lock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Saved privately to your gallery. Only you can see and re-equip it.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
