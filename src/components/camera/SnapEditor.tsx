/**
 * Snapchat-style snap editor: full-screen media with floating edge controls.
 * - top-left: Retake/Close
 * - top-right: tool rail (Text / Stickers / Draw / Image + registered extensions)
 * - bottom-left: Save to device + media-mode selector
 * - bottom-center: recipient/destination chip
 * - bottom-right: themed Send button
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  Download,
  ImageIcon,
  Loader2,
  Pencil,
  Send,
  Smile,
  Type,
  Undo,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { getFilterCSS } from './CameraFilterCarousel';
import { DraggableOverlay } from './DraggableOverlay';
import { MediaModeSelector } from './MediaModeSelector';
import type { CameraDrawPath, CameraTextOverlay } from '@/lib/bakeCameraEdits';
import type { SnapViewMode } from '@/lib/camera/snapDraft';
import type { SnapDestinationKind } from '@/lib/camera/cameraLaunchContext';
import {
  storyDestinationLabel,
  type StoryDestinationId,
} from '@/lib/camera/recipientSelection';
import { getSnapEditorExtensions } from '@/lib/camera/editorExtensions';
import { visibleStoryDestinationOptions } from '@/lib/camera/storyDestinationVisibility';
import { shouldAnimateSnapSend } from '@/lib/camera/snapFlowBehavior';

export interface SnapEditorResult {
  overlays: CameraTextOverlay[];
  drawings: CameraDrawPath[];
  displayWidth?: number;
  displayHeight?: number;
}

interface SnapEditorProps {
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  filter: string;
  destination: SnapDestinationKind;
  /** "Send to Mia" / "Send to The Crew +2" — null hides the chip. */
  chipLabel: string | null;
  viewMode: SnapViewMode;
  storyAudience?: StoryDestinationId | null;
  isSending?: boolean;
  /** True when tapping Send delivers directly (plays the shrink animation). */
  animateOnSend?: boolean;
  onViewModeChange: (mode: SnapViewMode) => void;
  onStoryAudienceChange?: (dest: StoryDestinationId) => void;
  onRetake: () => void;
  /** Chip tap — edit recipients (opens Send To preloaded with selection). */
  onEditRecipients: () => void;
  /** Chip clear — removes all preselected recipients. */
  onClearRecipients: () => void;
  onSend: (edits: SnapEditorResult) => void;
  onSaveToDevice: (edits: SnapEditorResult) => void | Promise<void>;
}

const COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#ff2d92'];
const STICKERS = ['😀', '😍', '🔥', '💯', '✨', '🎉', '❤️', '👍', '🙌', '💪', '🎵', '🌟'];

const STORY_AUDIENCES = visibleStoryDestinationOptions();

export function SnapEditor({
  mediaUrl,
  mediaType,
  filter,
  destination,
  chipLabel,
  viewMode,
  storyAudience,
  isSending = false,
  animateOnSend = true,
  onViewModeChange,
  onStoryAudienceChange,
  onRetake,
  onEditRecipients,
  onClearRecipients,
  onSend,
  onSaveToDevice,
}: SnapEditorProps) {
  const [mode, setMode] = useState<'none' | 'text' | 'sticker' | 'draw'>('none');
  const [textOverlays, setTextOverlays] = useState<CameraTextOverlay[]>([]);
  const [drawings, setDrawings] = useState<CameraDrawPath[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [isSavingLocal, setIsSavingLocal] = useState(false);
  const [sendFired, setSendFired] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const reducedMotion = useReducedMotion();

  const extensions = getSnapEditorExtensions();

  useEffect(() => {
    if (mode !== 'text') return;
    const t = window.setTimeout(() => {
      textInputRef.current?.focus();
      textInputRef.current?.select();
    }, 80);
    return () => window.clearTimeout(t);
  }, [mode]);

  // Safety: if the flow keeps the editor mounted after Send (e.g. it opened the
  // recipient picker instead), un-shrink the canvas once the hand-off settled.
  useEffect(() => {
    if (!sendFired || isSending) return;
    const t = window.setTimeout(() => setSendFired(false), 700);
    return () => window.clearTimeout(t);
  }, [sendFired, isSending]);

  const stopTextInteraction = (e: React.SyntheticEvent) => e.stopPropagation();

  const collectEdits = (): SnapEditorResult => {
    const rect = containerRef.current?.getBoundingClientRect();
    let overlays = textOverlays;
    const pending = currentText.trim();
    if (pending) {
      overlays = [
        ...textOverlays,
        {
          id: crypto.randomUUID(),
          text: pending,
          x: 50,
          y: 50,
          color: currentColor,
          fontSize: 24,
          scale: 1,
          rotation: 0,
        },
      ];
    }
    return {
      overlays,
      drawings,
      displayWidth: rect?.width,
      displayHeight: rect?.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (mode !== 'draw') return;
    setIsDrawing(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCurrentPath([
      {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      },
    ]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || mode !== 'draw') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCurrentPath((prev) => [
      ...prev,
      {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      },
    ]);
  };

  const handlePointerUp = () => {
    if (!isDrawing || mode !== 'draw') return;
    setIsDrawing(false);
    if (currentPath.length > 1) {
      setDrawings((prev) => [
        ...prev,
        { id: crypto.randomUUID(), points: currentPath, color: currentColor, width: 4 },
      ]);
    }
    setCurrentPath([]);
  };

  const addText = () => {
    if (!currentText.trim()) return;
    setTextOverlays((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: currentText,
        x: 50,
        y: 50,
        color: currentColor,
        fontSize: 24,
        scale: 1,
        rotation: 0,
      },
    ]);
    setCurrentText('');
    setMode('none');
  };

  const addSticker = (emoji: string) => {
    setTextOverlays((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: emoji, x: 50, y: 50, color: '#ffffff', fontSize: 48, scale: 1, rotation: 0 },
    ]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setTextOverlays((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          text: '',
          imageUrl: URL.createObjectURL(file),
          x: 50,
          y: 50,
          color: '#ffffff',
          fontSize: 24,
          scale: 1,
          rotation: 0,
        },
      ]);
    }
    e.target.value = '';
  };

  const handleSend = () => {
    if (isSending || sendFired) return;
    triggerHaptic('medium');
    const edits = collectEdits();
    if (!shouldAnimateSnapSend(animateOnSend, reducedMotion)) {
      onSend(edits);
      return;
    }
    // Shrink-toward-send animation (<400ms) then hand off.
    setSendFired(true);
    window.setTimeout(() => onSend(edits), 260);
  };

  const handleSave = async () => {
    if (isSavingLocal) return;
    triggerHaptic('light');
    setIsSavingLocal(true);
    try {
      await onSaveToDevice(collectEdits());
    } finally {
      setIsSavingLocal(false);
    }
  };

  const tools = [
    { id: 'text' as const, icon: Type, label: 'Text' },
    { id: 'sticker' as const, icon: Smile, label: 'Stickers' },
    { id: 'draw' as const, icon: Pencil, label: 'Draw' },
  ];

  return (
    <div className="fixed inset-0 z-[6100] flex flex-col bg-black">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {/* Media canvas */}
      <motion.div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden"
        animate={
          sendFired && !reducedMotion
            ? { scale: 0.12, x: '38vw', y: '42vh', opacity: 0.15, borderRadius: 48 }
            : { scale: 1, x: 0, y: 0, opacity: 1, borderRadius: 0 }
        }
        transition={{ duration: 0.28, ease: 'easeIn' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {mediaType === 'photo' ? (
          <img
            src={mediaUrl}
            alt="Snap preview"
            className="h-full w-full object-contain"
            style={{ filter: getFilterCSS(filter) || undefined }}
            draggable={false}
          />
        ) : (
          <video
            src={mediaUrl}
            className="h-full w-full object-contain"
            style={{ filter: getFilterCSS(filter) || undefined }}
            autoPlay
            loop
            muted
            playsInline
          />
        )}

        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {drawings.map((path) => (
            <polyline
              key={path.id}
              points={path.points.map((p) => `${p.x}%,${p.y}%`).join(' ')}
              fill="none"
              stroke={path.color}
              strokeWidth={path.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {currentPath.length > 1 && (
            <polyline
              points={currentPath.map((p) => `${p.x}%,${p.y}%`).join(' ')}
              fill="none"
              stroke={currentColor}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>

        {textOverlays.map((overlay) => (
          <DraggableOverlay
            key={overlay.id}
            id={overlay.id}
            text={overlay.imageUrl ? undefined : overlay.text}
            imageUrl={overlay.imageUrl}
            x={overlay.x}
            y={overlay.y}
            color={overlay.color}
            fontSize={overlay.fontSize}
            scale={overlay.scale}
            rotation={overlay.rotation}
            containerRef={containerRef as React.RefObject<HTMLDivElement>}
            onUpdate={(id, updates) =>
              setTextOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)))
            }
            onRemove={(id) => setTextOverlays((prev) => prev.filter((o) => o.id !== id))}
            canRemove={mode === 'none'}
          />
        ))}
      </motion.div>

      {/* Top-left: Retake / Close */}
      <div
        className="absolute left-3 z-20"
        style={{ top: 'calc(var(--sat, 0px) + 0.75rem)' }}
      >
        <button
          type="button"
          aria-label="Retake"
          onClick={() => {
            triggerHaptic('light');
            onRetake();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-background/40 text-foreground backdrop-blur-xl active:scale-90"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Top-right: floating tool rail */}
      <div
        className="absolute right-3 z-20 flex flex-col items-center gap-2.5"
        style={{ top: 'calc(var(--sat, 0px) + 0.75rem)' }}
      >
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            aria-label={tool.label}
            onClick={() => {
              triggerHaptic('light');
              setMode(mode === tool.id ? 'none' : tool.id);
            }}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-xl transition-all active:scale-90',
              mode === tool.id
                ? 'border-primary/50 bg-primary/30 text-primary'
                : 'border-border/30 bg-background/40 text-foreground',
            )}
          >
            <tool.icon className="h-4.5 w-4.5" />
          </button>
        ))}
        <button
          type="button"
          aria-label="Add image"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-background/40 text-foreground backdrop-blur-xl active:scale-90"
        >
          <ImageIcon className="h-4.5 w-4.5" />
        </button>
        {extensions.map((ext) => (
          <button
            key={ext.id}
            type="button"
            aria-label={ext.label}
            onClick={() => void ext.run({ url: mediaUrl, type: mediaType })}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-background/40 text-foreground backdrop-blur-xl active:scale-90"
          >
            <ext.icon className="h-4.5 w-4.5" />
          </button>
        ))}
        {drawings.length > 0 && (
          <button
            type="button"
            aria-label="Undo drawing"
            onClick={() => setDrawings((prev) => prev.slice(0, -1))}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-background/40 text-foreground backdrop-blur-xl active:scale-90"
          >
            <Undo className="h-4.5 w-4.5" />
          </button>
        )}
      </div>

      {/* Text / sticker / color inputs */}
      <div className="absolute bottom-28 left-0 right-0 z-20 px-4">
        <AnimatePresence mode="wait">
          {mode === 'text' && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="mb-3 flex gap-2"
              onPointerDown={stopTextInteraction}
              onPointerUp={stopTextInteraction}
              onClick={stopTextInteraction}
              onTouchStart={stopTextInteraction}
            >
              <Input
                ref={textInputRef}
                value={currentText}
                onChange={(e) => setCurrentText(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') addText();
                }}
                onPointerDown={stopTextInteraction}
                placeholder="Type something…"
                className="flex-1 rounded-full border-border/20 bg-background/40 px-4 text-foreground placeholder:text-muted-foreground backdrop-blur-xl"
                autoFocus
                enterKeyHint="done"
                spellCheck={false}
              />
              <Button onClick={addText} size="icon" className="rounded-full bg-primary text-primary-foreground">
                <Check className="h-5 w-5" />
              </Button>
            </motion.div>
          )}

          {mode === 'sticker' && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="scrollbar-hide mb-3 flex gap-2 overflow-x-auto py-2"
            >
              {STICKERS.map((sticker) => (
                <button
                  key={sticker}
                  onClick={() => addSticker(sticker)}
                  className="p-2 text-3xl transition-transform hover:scale-125"
                >
                  {sticker}
                </button>
              ))}
            </motion.div>
          )}

          {(mode === 'text' || mode === 'draw') && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="mb-3 flex justify-center gap-2"
            >
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setCurrentColor(color)}
                  aria-label={`Color ${color}`}
                  className={cn(
                    'h-8 w-8 rounded-full border-2 transition-transform',
                    currentColor === color ? 'scale-125 border-white' : 'border-white/30',
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom bar: Save + mode | chip | Send */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 flex items-end justify-between gap-2 px-4"
        style={{ paddingBottom: 'calc(var(--sab, 0px) + 1rem)' }}
      >
        {/* Bottom-left: save + media mode */}
        <div className="flex items-end gap-2.5">
          <div className="flex flex-col items-center">
            <button
              type="button"
              aria-label="Save to device"
              onClick={() => void handleSave()}
              disabled={isSavingLocal}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border/30 bg-background/40 text-foreground backdrop-blur-xl active:scale-90 disabled:opacity-60"
            >
              {isSavingLocal ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Download className="h-4.5 w-4.5" />}
            </button>
            <span className="mt-0.5 text-[9px] font-medium text-foreground/70">Save</span>
          </div>
          {destination === 'direct' && (
            <MediaModeSelector value={viewMode} onChange={onViewModeChange} />
          )}
        </div>

        {/* Bottom-center: recipient / story destination chip */}
        <div className="flex min-w-0 flex-1 justify-center pb-1">
          {destination === 'story' && onStoryAudienceChange ? (
            <div className="relative">
              <AnimatePresence>
                {audienceOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute bottom-full left-1/2 mb-2 w-44 -translate-x-1/2 rounded-2xl border border-border/40 bg-background/85 p-1.5 backdrop-blur-xl"
                  >
                    {STORY_AUDIENCES.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          onStoryAudienceChange(a.id);
                          setAudienceOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold',
                          storyAudience === a.id
                            ? 'bg-primary/20 text-primary'
                            : 'text-foreground/80 hover:bg-muted/60',
                        )}
                      >
                        {storyDestinationLabel(a.id)}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                type="button"
                onClick={() => setAudienceOpen((v) => !v)}
                className="flex max-w-full items-center gap-1.5 truncate rounded-full border border-primary/40 bg-primary/20 px-4 py-2 text-xs font-semibold text-primary backdrop-blur-xl"
              >
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {storyAudience ? storyDestinationLabel(storyAudience) : 'My Story'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </button>
            </div>
          ) : chipLabel ? (
            <motion.div
              className="flex max-w-full items-center gap-0.5 rounded-full border border-primary/40 bg-primary/20 backdrop-blur-xl"
              animate={sendFired && !reducedMotion ? { scale: [1, 1.12, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onEditRecipients();
                }}
                className="truncate py-2 pl-4 pr-1 text-xs font-semibold text-primary"
              >
                {chipLabel}
              </button>
              <button
                type="button"
                aria-label="Remove recipients"
                onClick={() => {
                  triggerHaptic('light');
                  onClearRecipients();
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-primary/80 hover:text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ) : null}
        </div>

        {/* Bottom-right: Send */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            aria-label={chipLabel ? chipLabel : 'Choose recipients'}
            onClick={handleSend}
            disabled={isSending}
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform active:scale-90 disabled:opacity-70',
            )}
          >
            {isSending ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Send className="h-6 w-6 translate-x-[-1px] translate-y-[1px]" />
            )}
          </button>
          <span className="mt-0.5 text-[9px] font-medium text-foreground/70">Send</span>
        </div>
      </div>
    </div>
  );
}
