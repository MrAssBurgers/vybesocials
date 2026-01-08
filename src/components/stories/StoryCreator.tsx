import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { X, Camera, Image as ImageIcon, Star, Send, Loader2 } from 'lucide-react';
import { useCreateStory } from '@/hooks/useStories';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface StoryCreatorProps {
  onClose: () => void;
}

export function StoryCreator({ onClose }: StoryCreatorProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const createStory = useCreateStory();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isCloseFriendsOnly, setIsCloseFriendsOnly] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast.error('Please select an image or video');
      return;
    }

    // Validate file size (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File size must be less than 50MB');
      return;
    }

    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!selectedFile || !profile?.id) return;

    setIsUploading(true);

    try {
      // Upload to Supabase Storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${profile.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      // Create story
      await createStory.mutateAsync({
        mediaUrl: publicUrl,
        mediaType: selectedFile.type.startsWith('video/') ? 'video' : 'image',
        caption: caption.trim() || undefined,
        isCloseFriendsOnly,
      });

      toast.success('Story created!');
      onClose();
    } catch (error) {
      console.error('Failed to create story:', error);
      toast.error('Failed to create story');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white">
          <X className="h-6 w-6" />
        </Button>
        <h2 className="text-white font-semibold">{t('stories.createStory')}</h2>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        {preview ? (
          <div className="relative w-full max-w-md aspect-[9/16] rounded-2xl overflow-hidden">
            {selectedFile?.type.startsWith('video/') ? (
              <video
                src={preview}
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            )}

            {/* Caption input overlay */}
            <div className="absolute bottom-4 inset-x-4">
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t('stories.addCaption')}
                maxLength={150}
                className="bg-black/50 border-white/20 text-white placeholder:text-white/50"
              />
            </div>

            {/* Change button */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="absolute top-4 right-4"
            >
              Change
            </Button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-4 p-8 border-2 border-dashed border-white/30 rounded-2xl hover:border-white/50 transition-colors"
          >
            <div className="flex gap-4">
              <div className="p-4 bg-white/10 rounded-full">
                <ImageIcon className="h-8 w-8 text-white" />
              </div>
              <div className="p-4 bg-white/10 rounded-full">
                <Camera className="h-8 w-8 text-white" />
              </div>
            </div>
            <p className="text-white/70">{t('stories.selectMedia')}</p>
          </button>
        )}
      </div>

      {/* Footer */}
      {preview && (
        <div className="p-4 space-y-4">
          {/* Close friends toggle */}
          <div className="flex items-center justify-between bg-white/10 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Star className="h-5 w-5 text-green-400" />
              <Label htmlFor="close-friends" className="text-white font-medium">
                {t('stories.closeFriendsOnly')}
              </Label>
            </div>
            <Switch
              id="close-friends"
              checked={isCloseFriendsOnly}
              onCheckedChange={setIsCloseFriendsOnly}
            />
          </div>

          {/* Submit button */}
          <Button
            onClick={handleSubmit}
            disabled={isUploading}
            className="w-full gradient-animated text-white font-semibold h-12"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <Send className="h-5 w-5 mr-2" />
                {t('stories.share')}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </motion.div>
  );
}
