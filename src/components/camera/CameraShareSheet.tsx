import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Film, Clock, MessageCircle, Download, Send, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useContentSafety } from '@/hooks/useContentSafety';
import { VybeCheckFailed } from '@/components/safety/VybeCheckFailed';
import { getRecentMessageUsers, RecentMessageUser } from '@/lib/recentMessageUsers';
import { getShareRankedUserIds, recordShareTo } from '@/lib/shareRecency';

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
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const { toast } = useToast();
  const contentSafety = useContentSafety();

  // Get ranked people for DM sharing
  const rankedPeople = useMemo(() => {
    const recent = getRecentMessageUsers();
    const shareRanked = getShareRankedUserIds();
    
    // Sort recent users by share frequency ranking
    const sorted = [...recent].sort((a, b) => {
      const aIdx = shareRanked.indexOf(a.id);
      const bIdx = shareRanked.indexOf(b.id);
      // Users in share ranking come first, ordered by rank
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return 0;
    });
    return sorted;
  }, []);

  const toggleDestination = (dest: ShareDestination) => {
    setSelectedDestinations(prev => 
      prev.includes(dest) 
        ? prev.filter(d => d !== dest)
        : [...prev, dest]
    );
  };

  const toggleRecipient = (userId: string) => {
    setSelectedRecipients(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleShare = async () => {
    if (selectedDestinations.length === 0) {
      toast({ title: "Select a destination", description: "Choose where you want to share this", variant: "destructive" });
      return;
    }

    if (selectedDestinations.includes('dm') && selectedRecipients.length === 0) {
      toast({ title: "Select recipients", description: "Choose who to send this to", variant: "destructive" });
      return;
    }

    setIsSharing(true);

    if (mediaFile) {
      const scanResult = mediaType === 'video'
        ? await contentSafety.scanVideo(mediaFile)
        : await contentSafety.scanImage(mediaFile);

      if (scanResult.result === 'blocked') {
        setIsSharing(false);
        setScanMessage(scanResult.message || 'Content violates community guidelines');
        setScanCategories(scanResult.categories || []);
        setVybeCheckFailed(true);
        return;
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Record share targets for learning
    selectedRecipients.forEach(id => recordShareTo(id));

    const destinations = selectedDestinations.map(d => {
      switch(d) {
        case 'clip': return 'Clips';
        case 'story': return 'Story';
        case 'dm': return 'Messages';
        case 'save': return 'Camera Roll';
        default: return d;
      }
    });

    toast({ title: "Shared successfully!", description: `Posted to ${destinations.join(', ')}` });
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

        {/* DM Person Picker - shows when DM is selected */}
        <AnimatePresence>
          {selectedDestinations.includes('dm') && rankedPeople.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="text-xs text-white/40 mb-2 mt-1">Send to:</p>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                {rankedPeople.map((person) => {
                  const isSelected = selectedRecipients.includes(person.id);
                  return (
                    <button
                      key={person.id}
                      onClick={() => toggleRecipient(person.id)}
                      className="flex flex-col items-center gap-1 flex-shrink-0 w-16"
                    >
                      <div className="relative">
                        <Avatar className={cn(
                          "h-12 w-12 border-2 transition-colors",
                          isSelected ? "border-primary" : "border-transparent"
                        )}>
                          <AvatarImage src={person.avatar_url || undefined} />
                          <AvatarFallback className="bg-white/10 text-white text-xs">
                            {(person.display_name || person.username)?.[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                          >
                            <Check className="h-3 w-3 text-white" />
                          </motion.div>
                        )}
                      </div>
                      <span className="text-[11px] text-white/70 truncate w-full text-center">
                        {person.display_name || person.username}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
