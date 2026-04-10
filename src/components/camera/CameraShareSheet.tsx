import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Film, Clock, MessageCircle, Download, Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useContentSafety } from '@/hooks/useContentSafety';
import { VybeCheckFailed } from '@/components/safety/VybeCheckFailed';

interface CameraShareSheetProps {
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  mediaFile?: File;
  soundId?: string;
  soundStartTime?: number;
  onClose: () => void;
  onComplete: () => void;
}

type ShareDestination = 'clip' | 'story' | 'dm' | 'save';

export function CameraShareSheet({ mediaUrl, mediaType, mediaFile, soundId, soundStartTime, onClose, onComplete }: CameraShareSheetProps) {
  const [selectedDestinations, setSelectedDestinations] = useState<ShareDestination[]>([]);
  const [caption, setCaption] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [vybeCheckFailed, setVybeCheckFailed] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanCategories, setScanCategories] = useState<string[]>([]);
  const { toast } = useToast();
  const contentSafety = useContentSafety();

  const toggleDestination = (dest: ShareDestination) => {
    setSelectedDestinations(prev => 
      prev.includes(dest) 
        ? prev.filter(d => d !== dest)
        : [...prev, dest]
    );
  };

  const handleShare = async () => {
    if (selectedDestinations.length === 0) {
      toast({
        title: "Select a destination",
        description: "Choose where you want to share this",
        variant: "destructive",
      });
      return;
    }

    setIsSharing(true);

    // Run AI safety scan before sharing
    if (mediaFile) {
      let scanResult;
      if (mediaType === 'video') {
        scanResult = await contentSafety.scanVideo(mediaFile);
      } else {
        scanResult = await contentSafety.scanImage(mediaFile);
      }

      if (scanResult.result === 'blocked') {
        setIsSharing(false);
        setScanMessage(scanResult.message || 'Content violates community guidelines');
        setScanCategories(scanResult.categories || []);
        setVybeCheckFailed(true);
        return;
      }
    }

    // Simulate sharing - in real app, this would upload and share
    await new Promise(resolve => setTimeout(resolve, 1500));

    const destinations = selectedDestinations.map(d => {
      switch(d) {
        case 'clip': return 'Clips';
        case 'story': return 'Story';
        case 'dm': return 'Messages';
        case 'save': return 'Camera Roll';
        default: return d;
      }
    });

    toast({
      title: "Shared successfully!",
      description: `Posted to ${destinations.join(', ')}`,
    });

    setIsSharing(false);
    onComplete();
  };

  const destinations = [
    { id: 'clip' as ShareDestination, icon: Film, label: 'Post as Clip', color: 'from-pink-500 to-rose-500' },
    { id: 'story' as ShareDestination, icon: Clock, label: 'Add to Story', color: 'from-violet-500 to-purple-500' },
    { id: 'dm' as ShareDestination, icon: MessageCircle, label: 'Send to DM', color: 'from-blue-500 to-cyan-500' },
    { id: 'save' as ShareDestination, icon: Download, label: 'Save to Device', color: 'from-emerald-500 to-green-500' },
  ];

  if (vybeCheckFailed) {
    return (
      <VybeCheckFailed
        message={scanMessage}
        categories={scanCategories}
        caption={caption}
        mediaUrls={[mediaUrl]}
        contentType={mediaType === 'video' ? 'short' : 'post'}
        onEdit={() => { setVybeCheckFailed(false); onClose(); }}
        onAppealComplete={() => { setVybeCheckFailed(false); onComplete(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white">
          <X className="h-6 w-6" />
        </Button>
        <h2 className="text-lg font-semibold text-white">Share</h2>
        <div className="w-10" />
      </div>

      {/* Media Preview */}
      <div className="flex-shrink-0 h-48 bg-black/50 flex items-center justify-center overflow-hidden">
        {mediaType === 'photo' ? (
          <img src={mediaUrl} alt="Preview" className="h-full object-contain" />
        ) : (
          <video src={mediaUrl} className="h-full object-contain" autoPlay loop muted playsInline />
        )}
      </div>

      {/* Caption */}
      <div className="p-4 border-b border-white/10">
        <Textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Write a caption..."
          className="bg-white/5 border-white/10 text-white placeholder:text-white/40 resize-none"
          rows={3}
        />
      </div>

      {/* Share Destinations */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        <p className="text-sm text-white/60 mb-4">Share to:</p>
        
        {destinations.map(dest => (
          <motion.button
            key={dest.id}
            onClick={() => toggleDestination(dest.id)}
            className={cn(
              "w-full p-4 rounded-2xl flex items-center gap-4 transition-all",
              selectedDestinations.includes(dest.id)
                ? "bg-white/20 ring-2 ring-primary"
                : "bg-white/5 hover:bg-white/10"
            )}
            whileTap={{ scale: 0.98 }}
          >
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br",
              dest.color
            )}>
              <dest.icon className="h-6 w-6 text-white" />
            </div>
            <span className="text-white font-medium flex-1 text-left">{dest.label}</span>
            {selectedDestinations.includes(dest.id) && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-6 h-6 rounded-full bg-primary flex items-center justify-center"
              >
                <span className="text-white text-sm">✓</span>
              </motion.div>
            )}
          </motion.button>
        ))}
      </div>

      {/* Share Button */}
      <div className="p-4 pb-safe">
        <Button 
          onClick={handleShare}
          disabled={selectedDestinations.length === 0 || isSharing}
          className="w-full gradient-animated text-white font-semibold py-6 rounded-2xl flex items-center justify-center gap-2"
        >
          {isSharing ? (
            <>
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
              Checking & Sharing...
            </>
          ) : (
            <>
              <Send className="h-5 w-5" />
              Share Now
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
