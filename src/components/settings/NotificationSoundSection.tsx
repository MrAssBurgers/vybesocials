import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Phone, Volume2, VolumeX, Play, Square, ChevronDown, Music } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { haptics } from '@/lib/haptics';
import { 
  getSoundSettings, 
  updateSoundSettings, 
  getCustomSounds,
  type SoundSettings 
} from '@/lib/premiumSounds';
import { VYBE_SOUNDS } from '@/lib/vybeSoundAssets';
import { CustomRingtoneUploader } from './CustomRingtoneUploader';
import { useSyncCustomSounds } from '@/hooks/useCustomSounds';
import { subscribeDevicePreference } from '@/lib/devicePreferences';
import { useSoundPreview } from '@/hooks/useSoundPreview';

export function NotificationSoundSection() {
  const [settings, setSettings] = useState<SoundSettings>(getSoundSettings);
  const [customTonesOpen, setCustomTonesOpen] = useState(false);
  const preview = useSoundPreview();
  
  // Sync custom sounds from database to local storage
  useSyncCustomSounds();
  
  // Keep in sync with localStorage
  useEffect(() => {
    setSettings(getSoundSettings());
    return subscribeDevicePreference('vybe-sound-settings', () => setSettings(getSoundSettings()));
  }, []);
  
  const handleToggle = (key: Exclude<keyof SoundSettings, 'volume'>) => (checked: boolean) => {
    haptics.tap();
    const newSettings = { ...settings, [key]: checked };
    setSettings(newSettings);
    updateSoundSettings({ [key]: checked });
    
  };
  
  const handlePreview = (type: 'messages' | 'calls' | 'ui' | 'like' | 'comment') => {
    haptics.tap();
    const custom = getCustomSounds();
    switch (type) {
      case 'messages':
        void preview.play(custom.message_tone || VYBE_SOUNDS.dmReceived, 'messages');
        break;
      case 'calls':
        void preview.play(custom.call_ringtone || VYBE_SOUNDS.callRing, 'calls');
        break;
      case 'ui':
        void preview.play(VYBE_SOUNDS.sharePost, 'ui');
        break;
      case 'like':
        void preview.play(VYBE_SOUNDS.postLiked, 'messages');
        break;
      case 'comment':
        void preview.play(VYBE_SOUNDS.comment, 'messages');
        break;
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const volume = value[0] ?? settings.volume;
    const next = { ...settings, volume };
    setSettings(next);
    updateSoundSettings({ volume });
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
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 ring-1 ring-primary/20 shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.4)] flex items-center justify-center flex-shrink-0">
            {settings.master ? (
              <Volume2 className="w-6 h-6 text-primary" />
            ) : (
              <VolumeX className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-base mb-1">Sound Effects</h3>
            <p className="text-sm text-muted-foreground">
              Custom VYBE sound pack — DMs, likes, comments, calls & shares
            </p>
          </div>
          <Switch 
            aria-label="Sound effects"
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
                  <p className="text-xs text-muted-foreground">Receive, send & social alerts</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11"
                  onClick={() => handlePreview('messages')}
                  aria-label="Preview message sound"
                  disabled={!settings.messages || settings.volume === 0}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
                <Switch 
                  aria-label="Message sounds"
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
                  <p className="text-xs text-muted-foreground">Incoming and outgoing call cues</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11"
                  onClick={() => handlePreview('calls')}
                  aria-label="Preview call ringtone"
                  disabled={!settings.calls || settings.volume === 0}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
                <Switch 
                  aria-label="Call sounds"
                  checked={settings.calls} 
                  onCheckedChange={handleToggle('calls')}
                />
              </div>
            </div>
            
            {/* UI Sounds */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-background flex items-center justify-center">
                  <VybeMiniIcon size={16} showSparkles />
                </div>
                <div>
                  <p className="font-medium text-sm">Interface</p>
                  <p className="text-xs text-muted-foreground">Optional taps, sharing & celebrations</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11"
                  onClick={() => handlePreview('ui')}
                  aria-label="Preview interface sound"
                  disabled={!settings.ui || settings.volume === 0}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
                <Switch 
                  aria-label="Interface sounds"
                  checked={settings.ui} 
                  onCheckedChange={handleToggle('ui')}
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-muted/30 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">Overall volume</p>
                  <p className="text-xs text-muted-foreground">Fine-tune how loud effects feel</p>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
                  {settings.volume}%
                </span>
              </div>
              <Slider
                value={[settings.volume]}
                aria-label="Sound effects volume"
                min={0}
                max={100}
                step={1}
                onValueChange={handleVolumeChange}
                onValueCommit={() => {
                  if (settings.messages) handlePreview('messages');
                  else if (settings.calls) handlePreview('calls');
                  else if (settings.ui) handlePreview('ui');
                }}
              />
              {settings.volume === 0 && <p className="text-xs text-muted-foreground">Volume is muted. Raise it to hear a preview.</p>}
            </div>

            {/* Social previews */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={!settings.messages || settings.volume === 0}
                onClick={() => handlePreview('like')}
              >
                <Play className="h-3 w-3 mr-1" /> Like sound
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={!settings.messages || settings.volume === 0}
                onClick={() => handlePreview('comment')}
              >
                <Play className="h-3 w-3 mr-1" /> Comment sound
              </Button>
            </div>
          </motion.div>
        )}
        {preview.state !== 'idle' && (
          <Button type="button" variant="outline" className="mt-3" onClick={preview.stop}>
            <Square className="h-4 w-4" /> Stop preview
          </Button>
        )}
        <p className="text-xs text-muted-foreground mt-2" role="status">
          {preview.error || (preview.state === 'loading' ? 'Loading preview…' : preview.state === 'playing' ? 'Playing a short sample at your selected volume.' : '')}
        </p>
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
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent/20 to-primary/10 ring-1 ring-accent/20 shadow-[0_4px_16px_-6px_hsl(var(--accent)/0.4)] flex items-center justify-center flex-shrink-0">
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
                maxDuration={null}
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
          Interface sounds are off until you enable them. Native silent mode is respected when your device makes it available; use the master switch for guaranteed quiet.
        </p>
      </motion.div>
    </div>
  );
}
