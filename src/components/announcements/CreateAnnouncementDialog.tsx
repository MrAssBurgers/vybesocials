import { useState } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, Send, ImagePlus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateAnnouncement } from '@/hooks/useAnnouncements';
import { toast } from 'sonner';

export function CreateAnnouncementDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const createAnnouncement = useCreateAnnouncement();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error('Please fill in both title and content');
      return;
    }

    try {
      await createAnnouncement.mutateAsync({
        title: title.trim(),
        content: content.trim(),
        image_url: imageUrl.trim() || undefined,
      });
      toast.success('Announcement posted! 📢');
      setTitle('');
      setContent('');
      setImageUrl('');
      setOpen(false);
    } catch (error) {
      toast.error('Failed to post announcement');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full p-4 rounded-2xl liquid-glass-button flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl gradient-animated flex items-center justify-center">
            <Megaphone className="h-5 w-5 text-white" />
          </div>
          <div className="text-left">
            <p className="font-semibold">Post Announcement</p>
            <p className="text-xs text-muted-foreground">Broadcast to all users</p>
          </div>
        </motion.button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            New Announcement
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="Announcement title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="font-semibold"
          />
          <Textarea
            placeholder="Write your announcement..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
          />

          {/* Image URL */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ImagePlus className="h-3.5 w-3.5" />
              Image (optional)
            </div>
            <Input
              placeholder="Paste image URL..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            {imageUrl && (
              <div className="relative rounded-xl overflow-hidden border border-border">
                <img src={imageUrl} alt="Preview" className="w-full max-h-40 object-cover"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                <button type="button" onClick={() => setImageUrl('')}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createAnnouncement.isPending}>
              <Send className="h-4 w-4 mr-2" />
              {createAnnouncement.isPending ? 'Posting...' : 'Post'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
