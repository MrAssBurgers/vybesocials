import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, MessageCircle, Phone, Sparkles, Volume2, VolumeX, Play, ChevronDown, Music } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { haptics } from '@/lib/haptics';
import { 
  getSoundSettings, 
  updateSoundSettings, 
  previewSound,
  type SoundSettings 
} from '@/lib/premiumSounds';
import { CustomRingtoneUploader } from './CustomRingtoneUploader';
import { useSyncCustomSounds } from '@/hooks/useCustomSounds';

export function NotificationSoundSection() {
  const [settings, setSettings] = useState<SoundSettings>(getSoundSettings);
  const [customTonesOpen, setCustomTonesOpen] = useState(false);
  
  // Sync custom sounds from database to local storage
  useSyncCustomSounds();
  
  // Keep in sync with localStorage
  useEffect(() => {
    setSettings(getSoundSettings());
  }, []);
  
  const handleToggle = (key: keyof SoundSettings) => (checked: boolean) => {
    haptics.tap();
    const newSettings = { ...settings, [key]: checked };
    setSettings(newSettings);
    updateSoundSettings({ [key]: checked });
    
    // Play a preview when enabling
    if (checked && key === 'master') {
      previewSound('success');
    }
  };
  
  const handlePreview = (type: 'messages' | 'calls' | 'ui') => {
    haptics.tap();
    switch (type) {
      case 'messages':
        previewSound('messageReceive');
        break;
      case 'calls':
        previewSound('callRing');
        break;
      case 'ui':
        previewSound('toggle');
        break;
    }
  };

  return (
    <div className="space-y-6">
      {/* Master Sound Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            {settings.master ? (
              <Volume2 className="w-6 h-6 text-primary" />
            ) : (
              <VolumeX className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-base mb-1">Sound Effects</h3>
            <p className="text-sm text-muted-foreground">
              Premium, subtle sounds for a polished experience
            </p>
          </div>
          <Switch 
            checked={settings.master} 
            onCheckedChange={handleToggle('master')}
          />
        </div>
        
        {/* Category toggles - only show if master is on */}
        {settings.master && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-3 pt-4 border-t border-border/50"
          >
            {/* Messages */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-background flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Messages</p>
                  <p className="text-xs text-muted-foreground">Send & receive sounds</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => handlePreview('messages')}
                  disabled={!settings.messages}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
                <Switch 
                  checked={settings.messages} 
                  onCheckedChange={handleToggle('messages')}
                />
              </div>
            </div>
            
            {/* Calls */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-background flex items-center justify-center">
                  <Phone className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Calls</p>
                  <p className="text-xs text-muted-foreground">Ring, connect & end tones</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => handlePreview('calls')}
                  disabled={!settings.calls}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
                <Switch 
                  checked={settings.calls} 
                  onCheckedChange={handleToggle('calls')}
                />
              </div>
            </div>
            
            {/* UI Sounds */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-background flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Interface</p>
                  <p className="text-xs text-muted-foreground">Taps, toggles & feedback</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => handlePreview('ui')}
                  disabled={!settings.ui}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
                <Switch 
                  checked={settings.ui} 
                  onCheckedChange={handleToggle('ui')}
                />
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Custom Tones Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Collapsible open={customTonesOpen} onOpenChange={setCustomTonesOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full liquid-glass-card p-4 sm:p-6 flex items-center gap-4 hover:bg-muted/5 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Music className="w-6 h-6 text-accent-foreground" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="font-semibold text-base mb-1">Custom Tones</h3>
                <p className="text-sm text-muted-foreground">
                  Upload your own ringtones and message sounds
                </p>
              </div>
              <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${customTonesOpen ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 space-y-3"
            >
              <CustomRingtoneUploader
                soundType="message_tone"
                title="Message Tone"
                description="Plays when you receive a new message"
                maxDuration={5}
              />
              
              <CustomRingtoneUploader
                soundType="call_ringtone"
                title="Call Ringtone"
                description="Plays when someone calls you"
                maxDuration={15}
              />
            </motion.div>
          </CollapsibleContent>
        </Collapsible>
      </motion.div>

      {/* Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="liquid-glass-card p-4 sm:p-6 bg-muted/20"
      >
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Tip:</strong> Sounds are designed to be subtle and non-intrusive. 
          They automatically respect your system's mute/silent mode and won't play during calls or video playback.
        </p>
      </motion.div>
    </div>
  );
}
