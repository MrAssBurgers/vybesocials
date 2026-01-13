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
  const { openCall } = useCallOverlay();

  const createRoomAndOpen = useCallback(async (params: {
    callType: 'audio' | 'video';
    conversationId: string;
  }) => {
    if (isLoading) return;
    
    setIsLoading(true);

    try {
      // Request mic permission first (must happen from user gesture)
      try {
        await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: params.callType === 'video',
        });
      } catch (permError) {
        toast.error(
          params.callType === 'video'
            ? 'Microphone and camera permission required'
            : 'Microphone permission required'
        );
        return;
      }

      // POST to our edge function
      const { data, error } = await supabase.functions.invoke<CreateRoomResponse>(
        'api-calls-create-room',
        {
          body: {
            type: params.callType,
            expiryMinutes: 60,
          },
        }
      );

      if (error) {
        console.error('Create room error:', error);
        throw new Error(error.message || 'Failed to create room');
      }

      if (!data?.roomUrl || !data?.roomName) {
        throw new Error('Invalid response from server');
      }

      // Open the CallOverlay with the roomUrl
      openCall({
        roomUrl: data.roomUrl,
        roomName: data.roomName,
        callType: params.callType,
        conversationId: params.conversationId,
      });

    } catch (error: any) {
      console.error('Failed to create call room:', error);
      toast.error(error.message || 'Failed to start call');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, openCall]);

  return {
    createRoomAndOpen,
    isLoading,
  };
}
