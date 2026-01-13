import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface CallOverlayState {
  isOpen: boolean;
  roomUrl: string | null;
  roomName: string | null;
  callType: 'audio' | 'video' | null;
  conversationId: string | null;
}

interface CallOverlayContextType {
  state: CallOverlayState;
  openCall: (params: {
    roomUrl: string;
    roomName: string;
    callType: 'audio' | 'video';
    conversationId: string;
  }) => void;
  closeCall: () => void;
}

const initialState: CallOverlayState = {
  isOpen: false,
  roomUrl: null,
  roomName: null,
  callType: null,
  conversationId: null,
};

const CallOverlayContext = createContext<CallOverlayContextType | null>(null);

export function CallOverlayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CallOverlayState>(initialState);

  const openCall = useCallback((params: {
    roomUrl: string;
    roomName: string;
    callType: 'audio' | 'video';
    conversationId: string;
  }) => {
    setState({
      isOpen: true,
      roomUrl: params.roomUrl,
      roomName: params.roomName,
      callType: params.callType,
      conversationId: params.conversationId,
    });
  }, []);

  const closeCall = useCallback(() => {
    setState(initialState);
  }, []);

  return (
    <CallOverlayContext.Provider value={{ state, openCall, closeCall }}>
      {children}
    </CallOverlayContext.Provider>
  );
}

export function useCallOverlay() {
  const context = useContext(CallOverlayContext);
  if (!context) {
    throw new Error('useCallOverlay must be used within CallOverlayProvider');
  }
  return context;
}
