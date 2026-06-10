import { useState, memo } from 'react';
import { useAuth } from '@/lib/auth';
import { useMyNote, useFriendsNotes, useSetNote, useDeleteNote } from '@/hooks/useNotes';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
// GIPHY calls go through the giphy-search edge function (key stays server-side).

interface GifResult {
  id: string;
  url: string;
  preview: string;
}

export const NotesRow = memo(function NotesRow() {
  const { profile } = useAuth();
  const { data: myNote } = useMyNote();
  const { data: friendNotes = [] } = useFriendsNotes();
  const setNote = useSetNote();
  const deleteNote = useDeleteNote();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);

  const handleOpenEdit = () => {
    setNoteText(myNote?.content || '');
    setGifUrl(myNote?.gif_url || null);
    setShowGifPicker(false);
    setEditOpen(true);
  };

  const searchGifs = async (query: string) => {
    const trimmed = query.trim();
    setGifLoading(true);
    try {
      const { data } = await supabase.functions.invoke('giphy-search', {
        body: {
          endpoint: trimmed ? 'search' : 'trending',
          query: trimmed || undefined,
          limit: 20,
        },
      });
      setGifResults(
        ((data?.results || []) as any[]).map((r: any) => ({
          id: r.id,
          url: r.url || r.mediumUrl || r.previewUrl || '',
          preview: r.previewUrl || r.mediumUrl || r.url || '',
        }))
      );
    } catch { setGifResults([]); }
    setGifLoading(false);
  };

  const handleSave = () => {
    const trimmed = noteText.trim();
    if (!trimmed && !gifUrl) {
      deleteNote.mutate(undefined, {
        onSuccess: () => { setEditOpen(false); toast.success('Note removed'); },
      });
      return;
    }
    if (trimmed.length > 60) {
      toast.error('Note must be 60 characters or less');
      return;
    }
    setNote.mutate({ content: trimmed || '🎬', gifUrl: gifUrl || undefined }, {
      onSuccess: () => { setEditOpen(false); toast.success('Note updated!'); },
      onError: () => toast.error('Failed to update note'),
    });
  };

  const renderNoteBubble = (content: string, noteGifUrl?: string | null, maxW = 'max-w-[120px]') => {
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
      <div className="dm-notes-row relative z-0 px-2 pt-3 pb-1 overflow-x-auto no-scrollbar" style={{ overflowY: 'clip' }}>
        <div className="flex gap-2.5 min-w-max" style={{ overflow: 'visible' }}>
          {/* Current user's note */}
          <button onClick={handleOpenEdit} className="flex flex-col items-center w-12 flex-shrink-0" style={{ overflow: 'visible' }}>
            <div className="relative mb-0.5" style={{ overflow: 'visible' }}>
              {(myNote?.content || myNote?.gif_url) && renderNoteBubble(myNote?.content || '', myNote?.gif_url)}
              <Avatar className="dm-note-avatar dm-note-avatar--mine h-11 w-11">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-sm bg-muted">
                  {profile?.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <span className="text-[9px] text-muted-foreground mt-0.5 leading-none truncate max-w-[3rem]">
              {myNote ? 'Your note' : 'Add note'}
            </span>
          </button>

          {/* Friends' notes */}
          {friendNotes.map((note) => (
            <button
              key={note.id}
              onClick={() => note.profile && navigate(`/u/${note.profile.username}`)}
              className="flex flex-col items-center w-12 flex-shrink-0"
              style={{ overflow: 'visible' }}
            >
              <div className="relative mb-0.5" style={{ overflow: 'visible' }}>
                {renderNoteBubble(note.content, note.gif_url)}
                <Avatar className="dm-note-avatar dm-note-avatar--friend h-11 w-11">
                  <AvatarImage src={note.profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-sm">
                    {note.profile?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <span className="text-[9px] text-foreground truncate max-w-[3rem] mt-0.5 leading-none">
                {note.profile?.display_name || note.profile?.username}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Edit Note Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center">Set a Note</DialogTitle>
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
                      onClick={() => setGifUrl(null)}
                      className="absolute -top-1 -right-1 bg-destructive rounded-full p-0.5"
                    >
                      <X className="h-3 w-3 text-destructive-foreground" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <Input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Share what's on your mind..."
              maxLength={60}
              className="text-center rounded-full"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <p className="text-[10px] text-muted-foreground">{noteText.length}/60 · Expires in 24h</p>
            
            {/* GIF button */}
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-xs"
              onClick={() => {
                setShowGifPicker(!showGifPicker);
                if (!showGifPicker) searchGifs('');
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
                    value={gifSearch}
                    onChange={(e) => {
                      setGifSearch(e.target.value);
                      searchGifs(e.target.value);
                    }}
                    placeholder="Search GIFs..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto rounded-lg">
                  {gifLoading ? (
                    <p className="col-span-3 text-center text-xs text-muted-foreground py-4">Loading...</p>
                  ) : gifResults.length === 0 ? (
                    <p className="col-span-3 text-center text-xs text-muted-foreground py-4">No GIFs found</p>
                  ) : (
                    gifResults.map((gif) => (
                      <button
                        key={gif.id}
                        onClick={() => {
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
                  onClick={() => {
                    deleteNote.mutate(undefined, {
                      onSuccess: () => { setEditOpen(false); toast.success('Note removed'); },
                    });
                  }}
                >
                  Remove
                </Button>
              )}
              <Button
                className="flex-1 rounded-full"
                onClick={handleSave}
                disabled={setNote.isPending}
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
