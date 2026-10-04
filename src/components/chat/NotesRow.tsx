import { useState, useEffect, useRef, useCallback, useId, memo } from 'react';
import { useAuth } from '@/lib/auth';
import { useMyNote, useFriendsNotes, useSetNote, useDeleteNote } from '@/hooks/useNotes';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { tokenAccountGuard, tokenAccountSnapshot } from '@/lib/tokenMarketplaceService';
import { validNoteGifUrl } from '@/lib/userNotesService';
import './NotesRow.css';
// GIPHY calls go through the giphy-search edge function (key stays server-side).

interface GifResult {
  id: string;
  url: string;
  preview: string;
}

export const NotesRow = memo(function NotesRow() {
  const { user, profile } = useAuth();
  const ownQuery = useMyNote();
  const friendsQuery = useFriendsNotes();
  const myNote = ownQuery.data;
  const friendNotes = friendsQuery.data;
  const setNote = useSetNote();
  const deleteNote = useDeleteNote();
  const navigate = useNavigate();
  const editorId = useId();
  const ownButton = useRef<HTMLButtonElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expectedRevision, setExpectedRevision] = useState<string | null>(null);
  const lifecycle = useRef({ mounted: true, editor: 0, draft: 0, gif: 0 });
  const account = tokenAccountSnapshot();
  const accountKey = JSON.stringify([user?.id, account.epoch, profile?.id]);
  const busy = setNote.isPending || deleteNote.isPending;
  useEffect(() => {
    lifecycle.current.mounted = true;
    return () => { lifecycle.current.mounted = false; lifecycle.current.editor++; lifecycle.current.gif++; };
  }, []);
  useEffect(() => {
    lifecycle.current.editor++; lifecycle.current.gif++;
    setEditOpen(false); setNoteText(''); setGifUrl(null); setGifResults([]); setGifError(null); setSaveError(null);
  }, [accountKey]);

  const setOpen = (open: boolean) => {
    lifecycle.current.editor++; lifecycle.current.gif++;
    setEditOpen(open);
  };

  const handleOpenEdit = () => {
    if (!ownQuery.state) return;
    lifecycle.current.editor++; lifecycle.current.draft++;
    setNoteText(myNote?.content || '');
    setGifUrl(myNote?.gif_url || null);
    setShowGifPicker(false);
    setExpectedRevision(ownQuery.state.revision);
    setSaveError(null); setGifError(null); setGifSearch('');
    setEditOpen(true);
  };

  const searchGifs = useCallback(async (query: string) => {
    const trimmed = query.trim();
    const guard = tokenAccountGuard(user?.id);
    const generation = ++lifecycle.current.gif;
    const editor = lifecycle.current.editor;
    const current = () => {
      try { guard(); return lifecycle.current.mounted && lifecycle.current.gif === generation && lifecycle.current.editor === editor; } catch { return false; }
    };
    setGifLoading(true);
    setGifError(null);
    try {
      guard();
      const { data, error } = await db.functions.invoke('giphy-search', {
        body: {
          endpoint: trimmed ? 'search' : 'trending',
          query: trimmed || undefined,
          limit: 20,
        },
      });
      if (!current()) return;
      if (error || !Array.isArray(data?.results)) throw new Error('GIFs could not load. Please retry.');
      setGifResults(
        data.results.filter((r: any) => r && typeof r.id === 'string' && validNoteGifUrl(r.url || r.mediumUrl || r.previewUrl))
          .slice(0, 20).map((r: any) => ({
          id: r.id,
          url: r.url || r.mediumUrl || r.previewUrl || '',
          preview: validNoteGifUrl(r.previewUrl) ? r.previewUrl : r.url || r.mediumUrl,
        }))
      );
    } catch { if (current()) { setGifError('GIFs could not load. Please retry.'); setGifResults([]); } }
    finally { if (current()) setGifLoading(false); }
  }, [user?.id]);

  useEffect(() => {
    if (!editOpen || !showGifPicker) return;
    const timer = window.setTimeout(() => void searchGifs(gifSearch), 250);
    return () => { window.clearTimeout(timer); lifecycle.current.gif++; };
  }, [editOpen, showGifPicker, gifSearch, searchGifs]);

  const changeCallbacks = (confirmation = 'Note saved') => {
    const guard = tokenAccountGuard(user?.id); const editor = lifecycle.current.editor; const draft = lifecycle.current.draft;
    const current = () => { try { guard(); return lifecycle.current.mounted && lifecycle.current.editor === editor; } catch { return false; } };
    return {
      onSuccess: (result: { revision: string }) => {
        if (!current()) return;
        setExpectedRevision(result.revision);
        setSaveError(null);
        if (lifecycle.current.draft === draft) { setOpen(false); toast.success(confirmation); }
      },
      onError: (error: Error) => { if (current()) setSaveError(error.message || 'Your note could not be saved. Please retry.'); },
    };
  };
  const handleRemove = () => {
    if (busy) return;
    setSaveError(null);
    const callbacks = changeCallbacks('Note removed');
    deleteNote.mutate({ expectedRevision }, callbacks);
  };

  const handleSave = () => {
    if (busy) return;
    const trimmed = noteText.trim();
    if (!trimmed && !gifUrl) {
      setSaveError('Write a note or choose a GIF. Use Remove to delete your existing note.');
      return;
    }
    if (trimmed.length > 60) {
      toast.error('Note must be 60 characters or less');
      return;
    }
    setSaveError(null);
    setNote.mutate({ content: trimmed, gifUrl: gifUrl || undefined, expectedRevision }, changeCallbacks());
  };

  const renderNoteBubble = (content: string, noteGifUrl?: string | null, maxW = 'max-w-[96px]') => {
    if (noteGifUrl) {
      return (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-[2]">
          <div className="dm-note-bubble rounded-xl overflow-hidden shadow-lg" style={{ width: 56, height: 56 }}>
            <img src={noteGifUrl} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="w-2 h-2 bg-foreground/90 rounded-full mx-auto -mt-0.5" />
        </div>
      );
    }
    return (
      <div className={`absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap ${maxW} z-[2]`}>
        <div className={`dm-note-bubble text-[10px] px-2.5 py-1 rounded-full font-medium truncate ${maxW}`}>
          {content}
        </div>
        <div className="w-2 h-2 bg-foreground/90 rounded-full mx-auto -mt-0.5" />
      </div>
    );
  };

  return (
    <>
      {(ownQuery.isError || ownQuery.isExpired || friendsQuery.isError || friendsQuery.isExpired) && (
        <div role="alert" className="mx-4 mb-3 rounded-2xl border border-border/50 bg-muted/40 p-3 text-xs">
          <p>{ownQuery.isError || ownQuery.isExpired ? 'Your note could not be refreshed.' : 'Friends’ notes could not be refreshed.'}</p>
          <Button variant="ghost" size="sm" className="mt-1 rounded-full" disabled={ownQuery.isFetching || friendsQuery.isFetching}
            onClick={() => { void ownQuery.refetch(); void friendsQuery.refetch(); }}>Retry notes</Button>
        </div>
      )}
      <div className="dm-notes-row relative z-0 px-4 pt-10 pb-3 overflow-x-auto no-scrollbar" style={{ overflowY: 'clip' }}>
        <div className="flex gap-4 min-w-max" style={{ overflow: 'visible' }}>
          {/* Current user's note */}
          <button ref={ownButton} type="button" onClick={handleOpenEdit} disabled={!ownQuery.state}
            aria-label={ownQuery.isPending ? 'Loading your note' : !ownQuery.state ? 'Your note is unavailable' : myNote ? 'Edit your note' : 'Add a note'}
            aria-haspopup="dialog"
            className="flex flex-col items-center w-16 flex-shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 disabled:opacity-60" style={{ overflow: 'visible' }}>
            <div className="relative mb-1" style={{ overflow: 'visible' }}>
              {(myNote?.content || myNote?.gif_url) && renderNoteBubble(myNote?.content || '', myNote?.gif_url)}
              <Avatar className="dm-note-avatar dm-note-avatar--mine h-[3.25rem] w-[3.25rem]">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-sm bg-muted">
                  {profile?.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <span className="text-[10px] text-muted-foreground leading-none truncate max-w-[3.25rem]">
              {ownQuery.isPending ? 'Loading…' : !ownQuery.state ? 'Unavailable' : myNote ? 'My Note' : 'Add Note'}
            </span>
          </button>

          {/* Friends' notes */}
          {friendNotes.map((note) => (
            <button
              key={note.id}
              onClick={() => note.profile && navigate(`/u/${note.profile.username}`)}
              type="button"
              aria-label={`View ${note.profile?.display_name || note.profile?.username}'s profile. ${note.content ? `Note: ${note.content}.` : ''}${note.gif_url ? ' GIF attached.' : ''}`}
              title={note.content || 'GIF note'}
              className="flex flex-col items-center w-16 flex-shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
              style={{ overflow: 'visible' }}
            >
              <div className="relative mb-1" style={{ overflow: 'visible' }}>
                {renderNoteBubble(note.content, note.gif_url)}
                <Avatar className="dm-note-avatar dm-note-avatar--friend h-[3.25rem] w-[3.25rem]">
                  <AvatarImage src={note.profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-sm">
                    {note.profile?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <span className="text-[10px] text-foreground truncate max-w-[3.25rem] leading-none">
                {note.profile?.display_name?.split(' ')[0] || note.profile?.username}
              </span>
            </button>
          ))}
          {friendsQuery.hasNextPage && !friendsQuery.isError && (
            <Button variant="ghost" size="sm" className="rounded-full self-center" disabled={friendsQuery.isFetchingNextPage} onClick={() => void friendsQuery.fetchNextPage()}>
              {friendsQuery.isFetchingNextPage ? 'Loading…' : 'More notes'}
            </Button>
          )}
        </div>
      </div>

      {/* Edit Note Dialog */}
      <Dialog open={editOpen} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-2xl"
          onEscapeKeyDown={() => setOpen(false)}
          onCloseAutoFocus={event => { event.preventDefault(); ownButton.current?.focus({ preventScroll: true }); }}>
          <DialogHeader>
            <DialogTitle className="text-center">Set a Note</DialogTitle>
            <DialogDescription className="text-center text-xs">Share a short update with friends. Notes disappear after 24 hours.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="relative">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback>{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              {gifUrl && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2">
                  <div className="bg-foreground/90 rounded-xl overflow-hidden shadow-lg relative" style={{ width: 48, height: 48 }}>
                    <img src={gifUrl} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      aria-label="Remove GIF"
                      onClick={() => { lifecycle.current.draft++; setGifUrl(null); }}
                      className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center bg-destructive rounded-full"
                    >
                      <X className="h-3 w-3 text-destructive-foreground" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <label htmlFor={editorId} className="sr-only">Your note</label>
            <Input
              id={editorId}
              aria-describedby={`${editorId}-limit`}
              value={noteText}
              onChange={(e) => { lifecycle.current.draft++; setNoteText(e.target.value); }}
              placeholder="Share what's on your mind..."
              maxLength={60}
              className="text-center rounded-full"
              autoFocus
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); handleSave(); }
              }}
            />
            <p id={`${editorId}-limit`} className="text-[10px] text-muted-foreground">{noteText.length}/60 · Expires in 24h</p>
            {saveError && <p role="alert" className="text-xs text-destructive">{saveError}</p>}
            
            {/* GIF button */}
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-xs"
              onClick={() => {
                setShowGifPicker(!showGifPicker);
              }}
            >
              🎬 {showGifPicker ? 'Hide GIFs' : 'Add GIF'}
            </Button>

            {/* GIF Picker */}
            {showGifPicker && (
              <div className="w-full space-y-2">
                <div className="flex items-center gap-2 rounded-full border px-3 py-1.5">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    aria-label="Search GIFs"
                    value={gifSearch}
                    onChange={(e) => {
                      setGifSearch(e.target.value);
                    }}
                    placeholder="Search GIFs..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto rounded-lg">
                  {gifError ? (
                    <div role="alert" className="col-span-3 text-center text-xs py-4"><p>{gifError}</p><Button variant="ghost" size="sm" onClick={() => void searchGifs(gifSearch)}>Retry GIFs</Button></div>
                  ) : gifLoading ? (
                    <p className="col-span-3 text-center text-xs text-muted-foreground py-4">Loading...</p>
                  ) : gifResults.length === 0 ? (
                    <p className="col-span-3 text-center text-xs text-muted-foreground py-4">No GIFs found</p>
                  ) : (
                    gifResults.map((gif, index) => (
                      <button
                        key={gif.id}
                        type="button"
                        aria-label={`Choose GIF ${index + 1}`}
                        onClick={() => {
                          lifecycle.current.draft++;
                          setGifUrl(gif.url);
                          setShowGifPicker(false);
                        }}
                        className="aspect-square rounded-lg overflow-hidden hover:ring-2 ring-primary transition-all"
                      >
                        <img src={gif.preview || gif.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 w-full">
              {myNote && (
                <Button
                  variant="outline"
                  className="flex-1 rounded-full"
                  onClick={handleRemove}
                  disabled={busy}
                >
                  Remove
                </Button>
              )}
              <Button
                className="flex-1 rounded-full"
                onClick={handleSave}
                disabled={busy}
              >
                {myNote ? 'Update' : 'Share'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
