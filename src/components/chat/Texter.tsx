import { memo, useCallback, useEffect, useRef, useState, type RefObject, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, ChevronLeft, Loader2, Mic, Send } from 'lucide-react';
import { Toybox } from '@/components/chat/Toybox';
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import { VoiceNoteReviewBar } from '@/components/chat/VoiceNoteReviewBar';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

const MAX_LINES = 5;
const LINE_HEIGHT_PX = 22;
const SINGLE_LINE_HEIGHT = LINE_HEIGHT_PX + 16;

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
  const [voiceReview, setVoiceReview] = useState<{ blob: Blob; duration: number } | null>(null);
  const voicePointerIdRef = useRef<number | null>(null);
  const voiceCaptureElRef = useRef<HTMLElement | null>(null);

  const releaseVoicePointerCapture = () => {
    const el = voiceCaptureElRef.current;
    const id = voicePointerIdRef.current;
    if (el && id != null) {
      try {
        if (el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
      } catch {
        /* ignore */
      }
    }
    voiceCaptureElRef.current = null;
    voicePointerIdRef.current = null;
  };

  // Batched in rAF — a synchronous height write + scrollHeight read on every
  // keystroke forces layout mid-typing, which is felt on mobile keyboards.
  const resizeRafRef = useRef<number | null>(null);
  const autoResize = useCallback(() => {
    if (resizeRafRef.current !== null) return;
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = null;
      const el = inputRef.current;
      if (!el) return;
      el.style.height = 'auto';
      const max = LINE_HEIGHT_PX * MAX_LINES + 16;
      el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    });
  }, [inputRef]);

  useEffect(() => () => {
    if (resizeRafRef.current !== null) cancelAnimationFrame(resizeRafRef.current);
    releaseVoicePointerCapture();
  }, []);

  const handleVoicePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    voiceCaptureElRef.current = target;
    voicePointerIdRef.current = e.pointerId;
    target.setPointerCapture(e.pointerId);
    voiceStart.current = { x: e.clientX, y: e.clientY };
    cancelVoiceRef.current = false;
    setSlideCancel(false);
    setVoiceReview(null);
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
    releaseVoicePointerCapture();
    if (cancelVoiceRef.current || slideCancel) {
      onVoiceHoldCancel?.();
      onVoiceRecordingCancel?.();
      setVoiceReview(null);
    } else if (!isVoiceLocked) {
      onVoiceHoldEnd();
    }
    voiceStart.current = null;
    setSlideCancel(false);
    cancelVoiceRef.current = false;
  };

  const clearVoiceReview = () => {
    setVoiceReview(null);
    onVoiceRecordingCancel?.();
  };

  return (
    <div className="texter-stack w-full">
      {headerSlot}

      <AnimatePresence mode="wait">
        {voiceReview && onVoiceRecordingComplete ? (
          <motion.div
            key="voice-review"
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="w-full"
          >
            <VoiceNoteReviewBar
              blob={voiceReview.blob}
              durationSeconds={voiceReview.duration}
              isUploading={isUploadingMedia}
              onSend={() => {
                onVoiceRecordingComplete(voiceReview.blob);
                setVoiceReview(null);
              }}
              onDiscard={clearVoiceReview}
              onRecordAgain={() => {
                setVoiceReview(null);
                onVoiceHoldStart();
              }}
            />
          </motion.div>
        ) : isRecordingVoice && onVoiceRecordingComplete && onVoiceRecordingCancel ? (
          <motion.div
            key="recording"
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="texter-pill texter-pill--recording"
          >
            <div className="texter-pill__inner">
              <VoiceRecorder
                onRecordingComplete={onVoiceRecordingComplete}
                onCancel={onVoiceRecordingCancel}
                onReviewReady={(blob, duration) => {
                  setVoiceReview({ blob, duration });
                  onVoiceRecordingCancel?.();
                }}
                isUploading={isUploadingMedia}
                locked={isVoiceLocked}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="compose"
            layout
            initial={{ opacity: 0, y: 6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className={cn('texter-pill', slideCancel && 'texter-pill--cancel')}
          >
            <span className="texter-pill__glow" aria-hidden />
            <span className="texter-pill__shine" aria-hidden />

            <motion.div layout className="texter-pill__inner" transition={{ type: 'spring', stiffness: 400, damping: 32 }}>
              <div className="texter-actions texter-actions--start">
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
                  style={{ height: `${SINGLE_LINE_HEIGHT}px` }}
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
                    className="texter-icon-btn texter-icon-btn--camera"
                    aria-label="Vybe Snap"
                  >
                    <Camera className="texter-icon-btn__glyph" strokeWidth={2.25} />
                  </button>
                )}
                <AnimatePresence mode="wait" initial={false}>
                  {hasText ? (
                    <motion.button
                      key="send"
                      type="button"
                      initial={{ opacity: 0, scale: 0.82, rotate: -18 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.82, rotate: 18 }}
                      transition={{ type: 'spring', stiffness: 480, damping: 28 }}
                      onClick={() => {
                        triggerHaptic('medium');
                        onSend();
                      }}
                      disabled={isPending}
                      className="texter-icon-btn texter-icon-btn--send"
                      aria-label="Send"
                    >
                      {isPending ? (
                        <Loader2 className="texter-icon-btn__glyph animate-spin" />
                      ) : (
                        <Send className="texter-icon-btn__glyph" strokeWidth={2.25} />
                      )}
                    </motion.button>
                  ) : (
                    <motion.div key="mic" className="relative" initial={false} animate={{ opacity: 1 }}>
                      <AnimatePresence>
                        {slideCancel && (
                          <motion.div
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            className="absolute -top-9 right-0 flex items-center gap-1 text-[10px] font-semibold text-destructive whitespace-nowrap pointer-events-none"
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
                        <Mic className="texter-icon-btn__glyph" strokeWidth={2.25} />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
