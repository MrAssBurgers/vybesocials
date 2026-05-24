import { useState, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, Smile, Send, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useCreateComment } from '@/hooks/useComments';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GifPicker } from '@/components/chat/GifPicker';
import { cn } from '@/lib/utils';

interface CommentComposerProps {
  postId: string;
  authorId: string;
  onCommentAdded?: () => void;
}

export const CommentComposer = memo(function CommentComposer({
  postId,
  authorId,
  onCommentAdded,
}: CommentComposerProps) {
  const { profile } = useAuth();
  const createComment = useCreateComment();
  
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'gif' | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `comments/${profile.user_id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      setMediaUrl(publicUrl);
      setMediaType('image');
    } catch (error) {
      console.error('Failed to upload image:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [profile]);

  const handleGifSelect = useCallback((gifUrl: string) => {
    setMediaUrl(gifUrl);
    setMediaType('gif');
    setShowGifPicker(false);
  }, []);

  const clearMedia = useCallback(() => {
    setMediaUrl(null);
    setMediaType(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!profile) {
      toast.error('Please sign in to comment');
      return;
    }

    if (!text.trim() && !mediaUrl) {
      return;
    }

    try {
      await createComment.mutateAsync({
        postId,
        text: text.trim(),
        authorId,
        imageUrl: mediaUrl || undefined,
      });

      setText('');
      setMediaUrl(null);
      setMediaType(null);
      onCommentAdded?.();
    } catch (error) {
      // Error already handled in mutation
    }
  }, [profile, text, mediaUrl, postId, authorId, createComment, onCommentAdded]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  if (!profile) return null;

  const canSubmit = (text.trim() || mediaUrl) && !createComment.isPending && !isUploading;

  return (
    <div className="space-y-2">
      {/* Media preview */}
      <AnimatePresence>
        {mediaUrl && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="relative inline-block"
          >
            <div className="relative rounded-lg overflow-hidden border border-border max-w-[200px]">
              <img
                src={mediaUrl}
                alt="Preview"
                className="w-full h-auto max-h-32 object-cover"
              />
              <Button
                variant="secondary"
                size="icon"
                aria-label="Remove media"
                onClick={clearMedia}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-background/80 hover:bg-background"
              >
                <X className="h-3 w-3" />
              </Button>
              {mediaType === 'gif' && (
                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/60 text-white">
                  GIF
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer input */}
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={profile.avatar_url || undefined} />
          <AvatarFallback>{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>

        <div className="flex-1 flex items-center gap-1 bg-muted rounded-full px-3 py-1">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Add a comment..."
            className="border-0 bg-transparent p-0 h-8 focus-visible:ring-0"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />

          <Button
            variant="ghost"
            size="icon"
            aria-label="Attach image"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || !!mediaUrl}
            className="h-7 w-7 flex-shrink-0"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Image className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>

          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Insert GIF"
              onClick={() => setShowGifPicker(!showGifPicker)}
              disabled={!!mediaUrl}
              className="h-7 w-7 flex-shrink-0"
            >
              <Smile className="h-4 w-4 text-muted-foreground" />
            </Button>

            <AnimatePresence>
              {showGifPicker && (
                <div className="absolute bottom-full right-0 mb-2 z-50">
                  <GifPicker
                    onSelect={handleGifSelect}
                    onClose={() => setShowGifPicker(false)}
                  />
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <Button
          size="icon"
          aria-label="Post comment"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            "h-8 w-8 rounded-full flex-shrink-0 transition-all",
            canSubmit ? "bg-primary" : "bg-muted"
          )}
        >
          {createComment.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
});
