import { useState, useEffect } from 'react';
import { Pencil, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateAnnouncement } from '@/hooks/useAnnouncements';
import { MediaUploadField } from './MediaUploadField';
import { toast } from 'sonner';

interface Props {
  announcement: {
    id: string;
    title: string;
    content: string;
    image_url?: string | null;
    media_type?: string | null;
  };
}

export function EditAnnouncementDialog({ announcement }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(announcement.title);
  const [content, setContent] = useState(announcement.content);
  const [mediaUrl, setMediaUrl] = useState(announcement.image_url || '');
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'gif' | null>(
    (announcement.media_type as any) || 'image'
  );
  const updateAnnouncement = useUpdateAnnouncement();

  useEffect(() => {
    if (open) {
      setTitle(announcement.title);
      setContent(announcement.content);
      setMediaUrl(announcement.image_url || '');
      setMediaType((announcement.media_type as any) || 'image');
    }
  }, [open, announcement]);

  const handleMediaChange = (url: string, type: 'image' | 'video' | 'gif' | null) => {
    setMediaUrl(url);
    setMediaType(type);
  };

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
        image_url: mediaUrl.trim() || null,
        media_type: mediaType,
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
          
          <MediaUploadField
            mediaUrl={mediaUrl}
            mediaType={mediaType}
            onMediaChange={handleMediaChange}
          />

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
