import { useState, useRef } from 'react';
import { ImagePlus, Video, X, Loader2, Repeat } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAnnouncementUpload } from '@/hooks/useAnnouncementUpload';
import { toast } from 'sonner';

interface Props {
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'gif' | null;
  onMediaChange: (url: string, type: 'image' | 'video' | 'gif' | null) => void;
}

export function MediaUploadField({ mediaUrl, mediaType, onMediaChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploadBlob, uploading } = useAnnouncementUpload();
  const [convertToGif, setConvertToGif] = useState(false);
  const [converting, setConverting] = useState(false);
  const [localVideoFile, setLocalVideoFile] = useState<File | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    
    if (isVideo) {
      setLocalVideoFile(file);
      setConvertToGif(false);
    }

    try {
      const result = await upload(file);
      onMediaChange(result.url, result.mediaType);
    } catch {
      toast.error('Failed to upload media');
    }
  };

  const handleConvertToGif = async () => {
    if (!localVideoFile) return;
    setConverting(true);

    try {
      const gifshot = await import('gifshot');
      const videoUrl = URL.createObjectURL(localVideoFile);

      gifshot.createGIF(
        {
          video: [videoUrl],
          gifWidth: 480,
          gifHeight: 270,
          interval: 0.1,
          numFrames: 20,
          frameDuration: 1,
          sampleInterval: 10,
        },
        async (obj: any) => {
          URL.revokeObjectURL(videoUrl);
          if (obj.error) {
            toast.error('GIF conversion failed');
            setConverting(false);
            return;
          }

          // Convert data URL to blob
          const resp = await fetch(obj.image);
          const blob = await resp.blob();
          const result = await uploadBlob(blob, 'converted.gif');
          onMediaChange(result.url, 'gif');
          setConverting(false);
          toast.success('Converted to GIF! 🎞️');
        }
      );
    } catch {
      toast.error('GIF conversion failed');
      setConverting(false);
    }
  };

  const removeMedia = () => {
    onMediaChange('', null);
    setLocalVideoFile(null);
    setConvertToGif(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ImagePlus className="h-3.5 w-3.5" />
        Media (optional)
      </div>

      {/* File picker */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl flex-1"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
          ) : (
            <><ImagePlus className="h-4 w-4 mr-2" /> Upload Image / Video</>
          )}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Preview */}
      {mediaUrl && (
        <div className="relative rounded-xl overflow-hidden border border-border">
          {mediaType === 'video' ? (
            <video src={mediaUrl} controls muted className="w-full max-h-40 object-cover" />
          ) : mediaType === 'gif' ? (
            <img src={mediaUrl} alt="GIF Preview" className="w-full max-h-40 object-cover" />
          ) : (
            <img src={mediaUrl} alt="Preview" className="w-full max-h-40 object-cover"
              onError={(e) => (e.currentTarget.style.display = 'none')} />
          )}
          <button type="button" onClick={removeMedia}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
            <X className="h-3 w-3 text-white" />
          </button>
        </div>
      )}

      {/* Convert to GIF toggle — only for videos */}
      {mediaType === 'video' && localVideoFile && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" />
            <Label className="text-xs font-medium cursor-pointer">Convert to looping GIF</Label>
          </div>
          <div className="flex items-center gap-2">
            {converting && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-lg text-xs h-7"
              onClick={handleConvertToGif}
              disabled={converting}
            >
              {converting ? 'Converting...' : 'Convert'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
