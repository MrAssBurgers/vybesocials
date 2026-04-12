import { useState, memo } from 'react';
import { useAuth } from '@/lib/auth';
import { useMyNote, useFriendsNotes, useSetNote, useDeleteNote } from '@/hooks/useNotes';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export const NotesRow = memo(function NotesRow() {
  const { profile } = useAuth();
  const { data: myNote } = useMyNote();
  const { data: friendNotes = [] } = useFriendsNotes();
  const setNote = useSetNote();
  const deleteNote = useDeleteNote();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  const handleOpenEdit = () => {
    setNoteText(myNote?.content || '');
    setEditOpen(true);
  };

  const handleSave = () => {
    const trimmed = noteText.trim();
    if (!trimmed) {
      deleteNote.mutate(undefined, {
        onSuccess: () => { setEditOpen(false); toast.success('Note removed'); },
      });
      return;
    }
    if (trimmed.length > 60) {
      toast.error('Note must be 60 characters or less');
      return;
    }
    setNote.mutate(trimmed, {
      onSuccess: () => { setEditOpen(false); toast.success('Note updated!'); },
      onError: () => toast.error('Failed to update note'),
    });
  };

  return (
    <>
      <div className="px-3 py-2 overflow-x-auto no-scrollbar">
        <div className="flex gap-4 min-w-max">
          {/* Current user's note */}
          <button onClick={handleOpenEdit} className="flex flex-col items-center w-16 flex-shrink-0">
            <div className="relative mb-1">
              {myNote && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap max-w-[80px]">
                  <div className="bg-foreground/90 text-background text-[10px] px-2 py-0.5 rounded-full font-medium truncate max-w-[80px]">
                    {myNote.content}
                  </div>
                  <div className="w-2 h-2 bg-foreground/90 rounded-full mx-auto -mt-0.5" />
                </div>
              )}
              <Avatar className="h-14 w-14 ring-2 ring-dashed ring-muted-foreground/30">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-sm bg-muted">
                  {profile?.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <span className="text-[10px] text-muted-foreground mt-1 leading-none">
              {myNote ? 'Your note' : 'Add note'}
            </span>
          </button>

          {/* Friends' notes */}
          {friendNotes.map((note) => (
            <button
              key={note.id}
              onClick={() => note.profile && navigate(`/u/${note.profile.username}`)}
              className="flex flex-col items-center w-16 flex-shrink-0"
            >
              <div className="relative mb-1">
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap max-w-[80px]">
                  <div className="bg-foreground/90 text-background text-[10px] px-2 py-0.5 rounded-full font-medium truncate max-w-[80px]">
                    {note.content}
                  </div>
                  <div className="w-2 h-2 bg-foreground/90 rounded-full mx-auto -mt-0.5" />
                </div>
                <Avatar className="h-14 w-14 ring-2 ring-primary/30">
                  <AvatarImage src={note.profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-sm">
                    {note.profile?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <span className="text-[10px] text-foreground truncate max-w-[60px] mt-1 leading-none">
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
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback>{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
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
