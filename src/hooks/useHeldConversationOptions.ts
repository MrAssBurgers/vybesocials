import { useCallback, useState } from 'react';
import type { DMConversationPreview } from '@/features/dms/dm.types';

export interface HeldConversationState {
  isOpen: boolean;
  preview: DMConversationPreview | null;
}

export function useHeldConversationOptions() {
  const [held, setHeld] = useState<HeldConversationState>({
    isOpen: false,
    preview: null,
  });

  const openConversationOptions = useCallback((preview: DMConversationPreview) => {
    setHeld({ isOpen: true, preview: { ...preview } });
  }, []);

  const closeConversationOptions = useCallback(() => {
    setHeld({ isOpen: false, preview: null });
  }, []);

  const setOptionsOpen = useCallback((open: boolean) => {
    if (!open) closeConversationOptions();
  }, [closeConversationOptions]);

  return {
    held,
    openConversationOptions,
    closeConversationOptions,
    setOptionsOpen,
    heldConversationId: held.preview?.id ?? null,
  };
}
