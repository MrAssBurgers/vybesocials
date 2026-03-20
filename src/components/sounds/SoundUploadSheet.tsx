import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Music2, Tag, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { useUploadSound } from '@/hooks/useUploadSound';

interface SoundUploadSheetProps {
  open: boolean;
  onClose: () => void;
}

export function SoundUploadSheet({ open, onClose }: SoundUploadSheetProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [duration, setDuration] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadSound, isUploading, progress } = useUploadSound();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate type
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/m4a', 'audio/mp4'];
    if (!validTypes.some(t => selectedFile.type.includes(t.split('/')[1]))) {
      return;
    }

    setFile(selectedFile);
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
    }

    // Get duration
    const audio = new Audio(URL.createObjectURL(selectedFile));
    audio.addEventListener('loadedmetadata', () => {
      setDuration(Math.round(audio.duration));
      URL.revokeObjectURL(audio.src);
    });
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) return;

    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    const result = await uploadSound({ file, title: title.trim(), tags, duration });

    if (result) {
      // Reset and close
      setFile(null);
      setTitle('');
      setTagsInput('');
      setDuration(0);
      onClose();
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setFile(null);
      setTitle('');
      setTagsInput('');
      onClose();
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-auto max-h-[80vh] p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Upload Sound
          </SheetTitle>
        </SheetHeader>

        <div className="p-4 space-y-4">
          {/* File picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          {!file ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Music2 className="h-7 w-7 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-medium">Tap to select audio file</p>
                <p className="text-xs text-muted-foreground mt-1">MP3, WAV, OGG, AAC · Max 20MB</p>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Music2 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / (1024 * 1024)).toFixed(1)}MB · {duration}s
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setFile(null)} disabled={isUploading}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name your sound..."
              maxLength={100}
              disabled={isUploading}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              Tags
            </label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="chill, beats, lofi (comma separated)"
              disabled={isUploading}
            />
          </div>

          {/* Progress */}
          <AnimatePresence>
            {isUploading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  Uploading & scanning...
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload button */}
          <Button
            className="w-full"
            onClick={handleUpload}
            disabled={!file || !title.trim() || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Sound
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
