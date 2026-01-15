import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Eye, EyeOff, X, Upload, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useMemeBanBackgrounds,
  useAddMemeBanBackground,
  useDeleteMemeBanBackground,
  useToggleMemeBanBackground,
} from '@/hooks/useMemeBanBackgrounds';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const MemeBanManager = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [gifUrl, setGifUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  const { data: backgrounds, isLoading } = useMemeBanBackgrounds();
  const addBackground = useAddMemeBanBackground();
  const deleteBackground = useDeleteMemeBanBackground();
  const toggleBackground = useToggleMemeBanBackground();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('gif') && !file.type.includes('image')) {
      toast.error('Please upload a GIF or image file');
      e.target.value = '';
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user?.id) {
      toast.error('Please sign in to upload');
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    try {
      const fileName = `meme-ban-${Date.now()}-${file.name}`;
      const filePath = `${authData.user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('media').getPublicUrl(filePath);
      setGifUrl(data.publicUrl);
      setPreviewUrl(data.publicUrl);
      toast.success('File uploaded!');
    } catch (error: any) {
      toast.error(error?.message || 'Upload failed');
      console.error(error);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleUrlChange = (url: string) => {
    setGifUrl(url);
    setPreviewUrl(url);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !gifUrl.trim()) {
      toast.error('Please provide a name and GIF URL');
      return;
    }

    await addBackground.mutateAsync({ name, gifUrl });
    setName('');
    setGifUrl('');
    setPreviewUrl('');
    setIsDialogOpen(false);
  };

  const handleDelete = async (id: string, backgroundName: string) => {
    if (confirm(`Delete "${backgroundName}"?`)) {
      await deleteBackground.mutateAsync(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Meme Ban Backgrounds</h2>
          <p className="text-muted-foreground text-sm">
            Manage the GIFs shown when users get meme banned
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Background
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Meme Ban Background</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Dancing Cat"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <Label>GIF Source</Label>
                <div className="mt-2 flex gap-2">
                  <label className="flex-1">
                    <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 cursor-pointer hover:border-primary/50 transition-colors">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {isUploading ? 'Uploading...' : 'Upload GIF'}
                      </span>
                    </div>
                    <input
                      type="file"
                      accept="image/gif,image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                  </label>
                </div>
              </div>

              <div>
                <Label htmlFor="gifUrl" className="flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  Or paste URL
                </Label>
                <Input
                  id="gifUrl"
                  placeholder="https://media.tenor.com/..."
                  value={gifUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                />
              </div>

              {previewUrl && (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-40 object-cover"
                    onError={() => setPreviewUrl('')}
                  />
                  <button
                    onClick={() => {
                      setPreviewUrl('');
                      setGifUrl('');
                    }}
                    className="absolute top-2 right-2 p-1 rounded-full bg-black/50 hover:bg-black/70"
                  >
                    <X className="h-4 w-4 text-white" />
                  </button>
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={addBackground.isPending || !name || !gifUrl}
                className="w-full"
              >
                {addBackground.isPending ? 'Adding...' : 'Add Background'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-video rounded-xl bg-muted animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {backgrounds?.map((bg) => (
              <motion.div
                key={bg.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group relative aspect-video rounded-xl overflow-hidden border border-border bg-muted"
              >
                <img
                  src={bg.gif_url}
                  alt={bg.name}
                  className={`w-full h-full object-cover transition-opacity ${
                    bg.is_active ? 'opacity-100' : 'opacity-40'
                  }`}
                />

                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                {/* Name */}
                <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white font-medium text-sm truncate">
                    {bg.name}
                  </p>
                  {bg.is_default && (
                    <span className="text-xs text-yellow-400">Default</span>
                  )}
                </div>

                {/* Actions */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() =>
                      toggleBackground.mutate({
                        id: bg.id,
                        isActive: !bg.is_active,
                      })
                    }
                    className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white"
                    title={bg.is_active ? 'Disable' : 'Enable'}
                  >
                    {bg.is_active ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </button>
                  {!bg.is_default && (
                    <button
                      onClick={() => handleDelete(bg.id, bg.name)}
                      className="p-2 rounded-full bg-red-500/80 hover:bg-red-500 text-white"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Inactive badge */}
                {!bg.is_active && (
                  <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-black/70 text-white text-xs">
                    Disabled
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {backgrounds?.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No meme ban backgrounds yet. Add one!
            </div>
          )}
        </div>
      )}
    </div>
  );
};
