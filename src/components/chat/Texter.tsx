import { memo, useCallback, useRef, useState, type RefObject, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, ChevronLeft, Loader2, Mic, Send } from 'lucide-react';
import { Toybox } from '@/components/chat/Toybox';
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

const MAX_LINES = 4;
const LINE_HEIGHT_PX = 22;

export interface TexterProps {
  hasText: boolean;
  getMessageText: () => string;
  appendToInput: (s: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  onFocus?: () => void;
  isPending?: boolean;
  isUploadingMedia?: boolean;
  onOpenVybeSnap?: () => void;
  onVoiceHoldStart: () => void;
  onVoiceHoldEnd: () => void;
  onVoiceHoldCancel?: () => void;
  onVoiceHoldMove?: (clientX: number, clientY: number) => void;
  isVoiceLocked?: boolean;
  isRecordingVoice?: boolean;
  onVoiceRecordingComplete?: (blob: Blob) => void;
  onVoiceRecordingCancel?: () => void;
  placeholder?: string;
  toyboxProps: React.ComponentProps<typeof Toybox>;
  /** Banners rendered above the pill (reply, edit, etc.) */
  headerSlot?: ReactNode;
}

export const Texter = memo(function Texter({
  hasText,
  getMessageText,
  appendToInput,
  inputRef,
  onChange,
  onKeyDown,
  onSend,
  onFocus,
  isPending,
  isUploadingMedia,
  onOpenVybeSnap,
  onVoiceHoldStart,
  onVoiceHoldEnd,
  onVoiceHoldCancel,
  onVoiceHoldMove,
  isVoiceLocked,
  isRecordingVoice,
  onVoiceRecordingComplete,
  onVoiceRecordingCancel,
  placeholder = 'Message',
  toyboxProps,
  headerSlot,
}: TexterProps) {
  const voiceStart = useRef<{ x: number; y: number } | null>(null);
  const cancelVoiceRef = useRef(false);
  const [slideCancel, setSlideCancel] = useState(false);

  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = LINE_HEIGHT_PX * MAX_LINES + 14;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [inputRef]);

  const handleVoicePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    voiceStart.current = { x: e.clientX, y: e.clientY };
    cancelVoiceRef.current = false;
    setSlideCancel(false);
    triggerHaptic('light');
    onVoiceHoldStart();
  };

  const handleVoicePointerMove = (e: React.PointerEvent) => {
    if (!voiceStart.current) return;
    onVoiceHoldMove?.(e.clientX, e.clientY);
    const dx = e.clientX - voiceStart.current.x;
    const cancel = dx < -72;
    cancelVoiceRef.current = cancel;
    setSlideCancel(cancel);
  };

  const handleVoicePointerUp = () => {
    if (cancelVoiceRef.current || slideCancel) {
      onVoiceHoldCancel?.();
      onVoiceRecordingCancel?.();
    } else if (!isVoiceLocked) {
      onVoiceHoldEnd();
    }
    voiceStart.current = null;
    setSlideCancel(false);
    cancelVoiceRef.current = false;
  };

  return (
    <div className="texter-stack w-full">
      {headerSlot}

      <AnimatePresence mode="wait">
        {isRecordingVoice && onVoiceRecordingComplete && onVoiceRecordingCancel ? (
          <motion.div
            key="recording"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="texter-pill texter-pill--recording"
          >
            <div className="texter-pill__inner">
              <VoiceRecorder
                onRecordingComplete={onVoiceRecordingComplete}
                onCancel={onVoiceRecordingCancel}
                isUploading={isUploadingMedia}
                autoSend
                locked={isVoiceLocked}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="compose"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className={cn('texter-pill', slideCancel && 'texter-pill--cancel')}
          >
            <span className="texter-pill__glow" aria-hidden />
            <span className="texter-pill__shine" aria-hidden />

            <div className="texter-pill__inner">
              <div className="texter-actions">
                <Toybox {...toyboxProps} triggerClassName="texter-icon-btn texter-icon-btn--tool" />
              </div>

              <div className="texter-field flex-1 min-w-0">
                <textarea
                  ref={inputRef}
                  defaultValue={getMessageText()}
                  rows={1}
                  onChange={(e) => {
                    onChange(e.target.value);
                    autoResize();
                  }}
                  onKeyDown={onKeyDown}
                  onFocus={() => {
                    onFocus?.();
                    autoResize();
                  }}
                  placeholder={placeholder}
                  disabled={isPending}
                  className="texter-input"
                  style={{ height: `${LINE_HEIGHT_PX + 12}px` }}
                />
              </div>

              <div className="texter-actions texter-actions--end">
                {onOpenVybeSnap && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onOpenVybeSnap();
                    }}
                    className="texter-icon-btn texter-icon-btn--camera shrink-0"
                    aria-label="Vybe Snap"
                  >
                    <Camera className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
                  </button>
                )}
                {hasText ? (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onSend();
                    }}
                    disabled={isPending}
                    className="texter-icon-btn texter-icon-btn--send shrink-0"
                    aria-label="Send"
                  >
                    {isPending ? (
                      <Loader2 className="h-[1.125rem] w-[1.125rem] animate-spin" />
                    ) : (
                      <Send className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
                    )}
                  </button>
                ) : (
                  <div className="relative shrink-0">
                    <AnimatePresence>
                      {slideCancel && (
                        <motion.div
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          className="absolute -top-9 right-0 flex items-center gap-1 text-[10px] font-semibold text-destructive whitespace-nowrap"
                        >
                          <ChevronLeft className="h-3 w-3" />
                          Release to cancel
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <button
                      type="button"
                      className={cn(
                        'texter-icon-btn texter-icon-btn--mic touch-none',
                        slideCancel && 'texter-icon-btn--cancel',
                      )}
                      aria-label="Voice note"
                      onPointerDown={handleVoicePointerDown}
                      onPointerMove={handleVoicePointerMove}
                      onPointerUp={handleVoicePointerUp}
                      onPointerCancel={handleVoicePointerUp}
                    >
                      <Mic className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
