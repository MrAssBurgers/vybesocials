import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCallOverlay } from '@/components/call';

interface CreateRoomResponse {
  roomUrl: string;
  roomName: string;
}

export function useCreateCallRoom() {
  const [isLoading, setIsLoading] = useState(false);
  const { openCall, state } = useCallOverlay();

  const createRoomAndOpen = useCallback(async (params: {
    callType: 'audio' | 'video';
    conversationId: string;
  }) => {
    console.log('[CALL DEBUG] Call button pressed', { callType: params.callType, conversationId: params.conversationId });
    
    if (isLoading) {
      console.log('[CALL DEBUG] Already loading, ignoring');
      return;
    }
    
    // Guard: if overlay is already open, do nothing
    if (state.isOpen) {
      console.log('[CALL DEBUG] CallOverlay already open, ignoring');
      return;
    }
    
    setIsLoading(true);

    try {
      // Request mic permission first (must happen from user gesture)
      console.log('[CALL DEBUG] Requesting media permissions...');
      try {
        await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: params.callType === 'video',
        });
        console.log('[CALL DEBUG] Media permissions granted');
      } catch (permError: any) {
        const errMsg = params.callType === 'video'
          ? 'Microphone and camera permission required'
          : 'Microphone permission required';
        console.error('[CALL DEBUG] Media permission denied:', permError);
        toast.error(errMsg);
        return;
      }

      // POST to our edge function
      console.log('[CALL DEBUG] Calling api-calls-create-room...');
      const { data, error } = await supabase.functions.invoke<CreateRoomResponse>(
        'api-calls-create-room',
        {
          body: {
            type: params.callType,
            expiryMinutes: 60,
          },
        }
      );

      console.log('[CALL DEBUG] Edge function response:', { data, error });

      if (error) {
        const errMsg = error.message || 'Failed to create room';
        console.error('[CALL DEBUG] Create room error:', error);
        toast.error(`Call failed: ${errMsg}`);
        return;
      }

      if (!data?.roomUrl) {
        const errMsg = 'No roomUrl in response';
        console.error('[CALL DEBUG] Invalid response - missing roomUrl:', data);
        toast.error(`Call failed: ${errMsg}`);
        return;
      }
      
      if (!data?.roomName) {
        const errMsg = 'No roomName in response';
        console.error('[CALL DEBUG] Invalid response - missing roomName:', data);
        toast.error(`Call failed: ${errMsg}`);
        return;
      }

      console.log('[CALL DEBUG] Opening CallOverlay with roomUrl:', data.roomUrl);
      
      // Open the CallOverlay with the roomUrl
      openCall({
        roomUrl: data.roomUrl,
        roomName: data.roomName,
        callType: params.callType,
        conversationId: params.conversationId,
      });
      
      console.log('[CALL DEBUG] openCall() called successfully');

    } catch (error: any) {
      const errMsg = error?.message || 'Unknown error occurred';
      console.error('[CALL DEBUG] Unexpected error:', error);
      toast.error(`Call failed: ${errMsg}`);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, openCall, state.isOpen]);

  return {
    createRoomAndOpen,
    isLoading,
  };
}
