import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Texter } from '@/components/chat/Texter';
import { StickerPanel } from '@/components/chat/StickerPanel';
import { shouldTrackSoftKeyboard } from '@/lib/keyboardInsets';
import type { Message, ViewMode } from '@/hooks/useMessages';
import { CornerUpLeft, Pencil, X } from 'lucide-react';

export interface ChatComposerProps {
  hasText: boolean;
  getMessageText: () => string;
  appendToInput: (s: string) => void;
  viewMode: ViewMode;
  showViewModeMenu: boolean;
  setShowViewModeMenu: (open: boolean) => void;
  isRecordingVoice: boolean;
  isUploadingMedia: boolean;
  replyingTo: Message | null;
  isPending: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  inputContainerRef: React.RefObject<HTMLDivElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleInputChange: (value: string) => void;
  handleKeyPress: (e: React.KeyboardEvent) => void;
  handleSend: () => void;
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleVideoSelect: (file: File) => void;
  handleVoiceRecordingComplete: (blob: Blob) => void;
  sendMediaMessage: (mediaUrl: string, mediaType: string) => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setIsRecordingVoice: (recording: boolean) => void;
  onLiveRecordingChange?: (recording: boolean) => void;
  clearReply: () => void;
  t: (key: string) => string;
  onOpenVanishThreads?: () => void;
  onOpenMemoryPins?: () => void;
  onOpenScheduleMessage?: () => void;
  onOpenDMSettings?: () => void;
  onOpenAdminPanel?: () => void;
  onOpenSnapCamera?: () => void;
  onCreateOffer?: () => void;
  hasBusinessProfile?: boolean;
  presentUsers?: { user_id: string; username: string; avatar_url: string | null; display_name: string | null; is_typing: boolean }[];
  typingUserIds?: string[];
  editingMessageId?: string | null;
  onCancelEdit?: () => void;
  showStickerPanel?: boolean;
  setShowStickerPanel?: (open: boolean) => void;
  onSendSticker?: (imageUrl: string) => void;
  isVoiceLocked?: boolean;
  setIsVoiceLocked?: (locked: boolean) => void;
  voiceLockStartYRef?: React.MutableRefObject<number | null>;
  safetyFilterNode?: React.ReactNode;
  messagesEndRef?: React.RefObject<HTMLElement | null>;
  messagesContainerRef?: React.RefObject<HTMLElement | null>;
  presenceSlot?: React.ReactNode;
}

/** DM composer dock — Texter, voice, toybox (extracted from ChatView). */
export const ChatComposer = memo(function ChatComposer({
  hasText,
  getMessageText,
  appendToInput,
  isRecordingVoice,
  isUploadingMedia,
  replyingTo,
  isPending,
  inputRef,
  fileInputRef,
  handleInputChange,
  handleKeyPress,
  handleSend,
  handleImageSelect,
  handleVideoSelect,
  handleVoiceRecordingComplete,
  sendMediaMessage,
  setIsRecordingVoice,
  onLiveRecordingChange,
  clearReply,
  t,
  onOpenVanishThreads,
  onOpenMemoryPins,
  onOpenScheduleMessage,
  onOpenDMSettings,
  onOpenAdminPanel,
  onOpenSnapCamera,
  onCreateOffer,
  hasBusinessProfile,
  editingMessageId,
  onCancelEdit,
  showStickerPanel,
  setShowStickerPanel,
  onSendSticker,
  isVoiceLocked,
  setIsVoiceLocked,
  voiceLockStartYRef,
  safetyFilterNode,
  messagesContainerRef,
  presenceSlot,
}: ChatComposerProps) {
  const messageScrollerRef = messagesContainerRef;
  const headerSlot = (
    <>
      {editingMessageId && (
        <div className="flex items-center gap-2 px-2 py-1.5 mb-2 bg-primary/10 rounded-xl border-l-2 border-primary">
          <Pencil className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <p className="text-[11px] text-primary font-medium flex-1">Editing message</p>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancelEdit}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      {replyingTo && (
        <div className="flex items-center gap-2 px-2 py-1.5 mb-2 bg-muted/40 rounded-xl border-l-2 border-primary/80">
          <CornerUpLeft className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-primary font-medium">
              Replying to {replyingTo.sender?.username || 'message'}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {replyingTo.content || (replyingTo.media_type === 'image' ? '📷 Photo' : '🎤 Voice message')}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearReply}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </>
  );

  return (
    <>
      {presenceSlot ? <div className="dm-presence-above-composer">{presenceSlot}</div> : null}
      <div className="dm-composer-dock vybe-chat-composer relative flex-shrink-0 z-30">
        {onSendSticker && showStickerPanel && setShowStickerPanel && (
          <StickerPanel
            open={showStickerPanel}
            onClose={() => setShowStickerPanel(false)}
            onSendSticker={onSendSticker}
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />

        <Texter
          hasText={hasText}
          getMessageText={getMessageText}
          appendToInput={appendToInput}
          inputRef={inputRef}
          onChange={handleInputChange}
          onKeyDown={handleKeyPress}
          onSend={handleSend}
          onFocus={() => {
            if (shouldTrackSoftKeyboard()) {
              window.setTimeout(() => {
                const scroller = messageScrollerRef?.current;
                if (scroller) scroller.scrollTop = scroller.scrollHeight;
              }, 120);
            }
          }}
          isPending={isPending}
          isUploadingMedia={isUploadingMedia}
          placeholder={t('messages.typeMessage')}
          headerSlot={headerSlot}
          onOpenVybeSnap={onOpenSnapCamera}
          isRecordingVoice={isRecordingVoice}
          isVoiceLocked={isVoiceLocked}
          onVoiceHoldStart={() => {
            if (voiceLockStartYRef) voiceLockStartYRef.current = null;
            setIsRecordingVoice(true);
            setIsVoiceLocked?.(false);
            onLiveRecordingChange?.(true);
          }}
          onVoiceHoldEnd={() => {
            if (isVoiceLocked) return;
            const stop = (window as Window & { __voiceRecorderStop?: () => void }).__voiceRecorderStop;
            stop?.();
          }}
          onVoiceHoldCancel={() => {
            setIsRecordingVoice(false);
            setIsVoiceLocked?.(false);
            onLiveRecordingChange?.(false);
          }}
          onVoiceHoldMove={(_clientX, clientY) => {
            if (!isRecordingVoice || isVoiceLocked || !voiceLockStartYRef) return;
            if (voiceLockStartYRef.current == null) voiceLockStartYRef.current = clientY;
            const dy = voiceLockStartYRef.current - clientY;
            if (dy > 48) {
              setIsVoiceLocked?.(true);
              voiceLockStartYRef.current = null;
            }
          }}
          onVoiceRecordingComplete={(blob) => {
            setIsRecordingVoice(false);
            setIsVoiceLocked?.(false);
            onLiveRecordingChange?.(false);
            handleVoiceRecordingComplete(blob);
          }}
          onVoiceRecordingCancel={() => {
            setIsRecordingVoice(false);
            setIsVoiceLocked?.(false);
            onLiveRecordingChange?.(false);
          }}
          toyboxProps={{
            onImageSelect: async (file) => {
              const dt = new DataTransfer();
              dt.items.add(file);
              handleImageSelect({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
            },
            onVideoSelect: handleVideoSelect,
            onGifSelect: async (gifUrl) => {
              await sendMediaMessage(gifUrl, 'gif');
            },
            onVoiceStart: () => {
              setIsRecordingVoice(true);
              onLiveRecordingChange?.(true);
            },
            onEmojiSelect: (emoji) => {
              appendToInput(emoji);
              inputRef.current?.focus();
            },
            isUploading: isUploadingMedia,
            onOpenVanishThreads,
            onOpenMemoryPins,
            onOpenScheduleMessage,
            onOpenDMSettings,
            onOpenAdminPanel,
            onOpenVybeCamera: onOpenSnapCamera,
            onCreateOffer,
            hasBusinessProfile,
            safetyFilterNode,
            triggerClassName: 'texter-icon-btn texter-icon-btn--tool',
          }}
        />
      </div>
    </>
  );
});
