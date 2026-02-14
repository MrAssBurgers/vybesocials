/**
 * Call Settings Sheet
 * 
 * Glassmorphic settings panel for call controls:
 * - Microphone input selection & volume
 * - Camera selection & preview
 * - Speaker output selection
 * - Audio/video quality settings
 */

import { useState, useEffect, useRef, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, 
  Mic, 
  Video, 
  Volume2, 
  ChevronDown, 
  Check,
  X,
  SlidersHorizontal,
  Sparkles,
  MonitorSpeaker,
  Camera
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MediaDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface CallSettingsSheetProps {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onMicChange?: (deviceId: string) => void;
  onCameraChange?: (deviceId: string) => void;
  onSpeakerChange?: (deviceId: string) => void;
  currentMic?: string;
  currentCamera?: string;
  currentSpeaker?: string;
  isVideoCall?: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
}

export const CallSettingsSheet = forwardRef<HTMLDivElement, CallSettingsSheetProps>(function CallSettingsSheet({
  isOpen,
  onOpenChange,
  onMicChange,
  onCameraChange,
  onSpeakerChange,
  currentMic,
  currentCamera,
  currentSpeaker,
  isVideoCall = true,
  isMuted = false,
  isVideoOff = false,
}, _ref) {
  const [microphones, setMicrophones] = useState<MediaDevice[]>([]);
  const [cameras, setCameras] = useState<MediaDevice[]>([]);
  const [speakers, setSpeakers] = useState<MediaDevice[]>([]);
  const [micVolume, setMicVolume] = useState([80]);
  const [speakerVolume, setSpeakerVolume] = useState([80]);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [hdVideo, setHdVideo] = useState(true);
  const [micLevel, setMicLevel] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  // Load available devices
  useEffect(() => {
    const loadDevices = async () => {
      try {
        // Request permissions first to get device labels
        await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideoCall });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        setMicrophones(devices
          .filter(d => d.kind === 'audioinput')
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 5)}`, kind: d.kind }))
        );
        
        setCameras(devices
          .filter(d => d.kind === 'videoinput')
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 5)}`, kind: d.kind }))
        );
        
        setSpeakers(devices
          .filter(d => d.kind === 'audiooutput')
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 5)}`, kind: d.kind }))
        );
      } catch (err) {
        console.error('Failed to enumerate devices:', err);
      }
    };

    if (isOpen) {
      loadDevices();
    }
  }, [isOpen, isVideoCall]);

  // Mic level visualization
  useEffect(() => {
    if (!isOpen || isMuted) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      }
      setMicLevel(0);
      return;
    }

    const startMicVisualization = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: currentMic ? { deviceId: currentMic } : true 
        });
        micStreamRef.current = stream;

        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        analyserRef.current.fftSize = 256;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

        const updateLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setMicLevel(Math.min(100, average * 1.5));
          animationRef.current = requestAnimationFrame(updateLevel);
        };

        updateLevel();
      } catch (err) {
        console.error('Failed to start mic visualization:', err);
      }
    };

    startMicVisualization();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [isOpen, isMuted, currentMic]);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="w-[340px] sm:w-[400px] p-0 border-l border-white/10 bg-transparent z-[10000]"
      >
        {/* Glassmorphic container */}
        <div className="h-full backdrop-blur-2xl bg-gradient-to-b from-background/95 via-background/90 to-background/95">
          <SheetHeader className="p-6 pb-4 border-b border-white/5">
            <SheetTitle className="flex items-center gap-3 text-foreground">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-white/10">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <span className="text-lg font-semibold">Call Settings</span>
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-100px)]">
            <div className="p-6 space-y-6">
              
              {/* Microphone Section */}
              <SettingsSection 
                icon={<Mic className="h-4 w-4" />} 
                title="Microphone"
                accentColor="primary"
              >
                {/* Device selector */}
                <DeviceSelector
                  devices={microphones}
                  currentDevice={currentMic}
                  onChange={onMicChange}
                  disabled={isMuted}
                />

                {/* Mic level indicator */}
                <div className="mt-4 space-y-2">
                  <Label className="text-xs text-muted-foreground">Input Level</Label>
                  <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-primary to-accent"
                      animate={{ width: `${micLevel}%` }}
                      transition={{ duration: 0.1 }}
                    />
                    {/* Glow effect when active */}
                    {micLevel > 20 && (
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: `linear-gradient(90deg, hsl(var(--primary) / 0.5) 0%, hsl(var(--accent) / 0.3) ${micLevel}%, transparent ${micLevel}%)`,
                          filter: 'blur(4px)',
                        }}
                        animate={{ opacity: [0.5, 0.8, 0.5] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                      />
                    )}
                  </div>
                </div>

                {/* Noise suppression toggle */}
                <ToggleSetting
                  label="Noise Suppression"
                  description="Reduce background noise"
                  icon={<Sparkles className="h-4 w-4 text-accent" />}
                  checked={noiseSuppression}
                  onCheckedChange={setNoiseSuppression}
                />

                {/* Echo cancellation toggle */}
                <ToggleSetting
                  label="Echo Cancellation"
                  description="Prevent audio feedback"
                  icon={<Volume2 className="h-4 w-4 text-primary" />}
                  checked={echoCancellation}
                  onCheckedChange={setEchoCancellation}
                />
              </SettingsSection>

              {/* Camera Section */}
              {isVideoCall && (
                <SettingsSection 
                  icon={<Camera className="h-4 w-4" />} 
                  title="Camera"
                  accentColor="accent"
                >
                  <DeviceSelector
                    devices={cameras}
                    currentDevice={currentCamera}
                    onChange={onCameraChange}
                    disabled={isVideoOff}
                  />

                  {/* HD Video toggle */}
                  <ToggleSetting
                    label="HD Video"
                    description="Higher quality, more bandwidth"
                    icon={<Video className="h-4 w-4 text-accent" />}
                    checked={hdVideo}
                    onCheckedChange={setHdVideo}
                  />

                  {/* Camera preview thumbnail */}
                  {!isVideoOff && (
                    <CameraPreview deviceId={currentCamera} />
                  )}
                </SettingsSection>
              )}

              {/* Speaker Section */}
              <SettingsSection 
                icon={<MonitorSpeaker className="h-4 w-4" />} 
                title="Speaker"
                accentColor="primary"
              >
                <DeviceSelector
                  devices={speakers}
                  currentDevice={currentSpeaker}
                  onChange={onSpeakerChange}
                />

                {/* Volume slider */}
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Volume</Label>
                    <span className="text-xs font-mono text-primary">{speakerVolume[0]}%</span>
                  </div>
                  <Slider
                    value={speakerVolume}
                    onValueChange={setSpeakerVolume}
                    max={100}
                    step={1}
                    className="[&_[role=slider]]:bg-gradient-to-r [&_[role=slider]]:from-primary [&_[role=slider]]:to-accent [&_[role=slider]]:border-0 [&_[role=slider]]:shadow-lg [&_[role=slider]]:shadow-primary/20"
                  />
                </div>
              </SettingsSection>

            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
});

// Settings section wrapper
function SettingsSection({ 
  icon, 
  title, 
  children,
  accentColor = 'primary'
}: { 
  icon: React.ReactNode; 
  title: string; 
  children: React.ReactNode;
  accentColor?: 'primary' | 'accent';
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className={cn(
          "p-1.5 rounded-lg",
          accentColor === 'primary' 
            ? "bg-primary/10 text-primary" 
            : "bg-accent/10 text-accent"
        )}>
          {icon}
        </div>
        <h3 className="font-medium text-sm text-foreground">{title}</h3>
      </div>
      <div className="pl-1 space-y-3">
        {children}
      </div>
    </div>
  );
}

// Device selector dropdown
function DeviceSelector({
  devices,
  currentDevice,
  onChange,
  disabled = false,
}: {
  devices: MediaDevice[];
  currentDevice?: string;
  onChange?: (deviceId: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedDevice = devices.find(d => d.deviceId === currentDevice) || devices[0];

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "w-full p-3 rounded-xl text-left transition-all duration-200",
          "bg-secondary/50 border border-white/5 hover:border-white/10",
          "flex items-center justify-between gap-2",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className="text-sm truncate text-foreground">
          {selectedDevice?.label || 'Select device'}
        </span>
        <ChevronDown className={cn(
          "h-4 w-4 text-muted-foreground transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-2 p-1 rounded-xl bg-popover/95 backdrop-blur-xl border border-white/10 shadow-2xl"
          >
            {devices.map((device) => (
              <button
                key={device.deviceId}
                onClick={() => {
                  onChange?.(device.deviceId);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full p-3 rounded-lg text-left text-sm transition-all",
                  "hover:bg-white/5 flex items-center justify-between",
                  device.deviceId === currentDevice && "bg-primary/10 text-primary"
                )}
              >
                <span className="truncate">{device.label}</span>
                {device.deviceId === currentDevice && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Toggle setting component
function ToggleSetting({
  label,
  description,
  icon,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-white/5">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="p-1.5 rounded-lg bg-white/5">
            {icon}
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-primary data-[state=checked]:to-accent"
      />
    </div>
  );
}

// Camera preview component
function CameraPreview({ deviceId }: { deviceId?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasStream, setHasStream] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startPreview = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId } : true
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasStream(true);
        }
      } catch (err) {
        console.error('Failed to start camera preview:', err);
      }
    };

    startPreview();

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [deviceId]);

  return (
    <div className="relative mt-4 rounded-xl overflow-hidden border-2 border-primary/20 shadow-lg shadow-primary/10">
      <div className="aspect-video bg-black/50">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {!hasStream && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Loading preview...</p>
            </div>
          </div>
        )}
      </div>
      {/* Highlight border glow */}
      <div className="absolute inset-0 rounded-xl pointer-events-none ring-1 ring-inset ring-white/10" />
      <motion.div
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          boxShadow: 'inset 0 0 20px hsl(var(--primary) / 0.1), 0 0 20px hsl(var(--primary) / 0.1)'
        }}
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </div>
  );
}

// Button to open settings (can be used in control bar)
export function CallSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "relative h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-300",
        "bg-white/10 text-white hover:bg-white/20 border border-white/10"
      )}
    >
      <SlidersHorizontal className="h-5 w-5" />
    </motion.button>
  );
}

CallSettingsSheet.displayName = 'CallSettingsSheet';
