import { useState, useEffect } from 'react';
import { Pencil, Save, ImagePlus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateAnnouncement } from '@/hooks/useAnnouncements';
import { toast } from 'sonner';

interface Props {
  announcement: {
    id: string;
    title: string;
    content: string;
    image_url?: string | null;
  };
}

export function EditAnnouncementDialog({ announcement }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(announcement.title);
  const [content, setContent] = useState(announcement.content);
  const [imageUrl, setImageUrl] = useState(announcement.image_url || '');
  const updateAnnouncement = useUpdateAnnouncement();

  useEffect(() => {
    if (open) {
      setTitle(announcement.title);
      setContent(announcement.content);
      setImageUrl(announcement.image_url || '');
    }
  }, [open, announcement]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error('Title and content are required');
      return;
    }
    try {
      await updateAnnouncement.mutateAsync({
        id: announcement.id,
        title: title.trim(),
        content: content.trim(),
        image_url: imageUrl.trim() || null,
      });
      toast.success('Announcement updated ✅');
      setOpen(false);
    } catch {
      toast.error('Failed to update');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-xl">
          <Pencil className="h-4 w-4 mr-1.5" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Announcement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="font-semibold" />
          <Textarea placeholder="Content" value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ImagePlus className="h-3.5 w-3.5" /> Image (optional)
            </div>
            <Input placeholder="Image URL..." value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
            {imageUrl && (
              <div className="relative rounded-xl overflow-hidden border border-border">
                <img src={imageUrl} alt="Preview" className="w-full max-h-40 object-cover"
                  onError={(e) => (e.currentTarget.style.display = 'none')} />
                <button type="button" onClick={() => setImageUrl('')}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={updateAnnouncement.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {updateAnnouncement.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
