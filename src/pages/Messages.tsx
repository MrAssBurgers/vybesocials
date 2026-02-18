import { useLocation } from 'react-router-dom';
import { ConversationList } from '@/components/chat/ConversationList';
import { ChatView } from '@/components/chat/ChatView';
import { AppLayout } from '@/components/layout/AppLayout';
import { useBreakpoint } from '@/hooks/usePlatform';
import { useEffect } from 'react';

export default function Messages() {
  const location = useLocation();
  const { isDesktop } = useBreakpoint();
  const isInChat = location.pathname !== '/messages';

  // On mobile, when in a chat, hide nav for immersive full-screen experience (Instagram-style)
  const hideNavOnMobile = isInChat && !isDesktop;

  // Hide the global background image while on the DM page (mobile/tablet)
  useEffect(() => {
    if (!isDesktop) {
      document.documentElement.setAttribute('data-dm-active', 'true');
      return () => {
        document.documentElement.removeAttribute('data-dm-active');
      };
    }
  }, [isDesktop]);

  return (
    <AppLayout hideRightSidebar fullWidth hideNav={hideNavOnMobile} noPadding>
      <div 
        className={`
          ${hideNavOnMobile 
            ? 'h-[100dvh] fixed inset-0 z-50' 
            : 'min-h-[100dvh] md:min-h-screen h-[100dvh] md:h-screen w-full'
          } 
          flex max-w-full pb-0
        `}
        style={{ 
          position: isDesktop ? undefined : 'fixed',
          inset: isDesktop ? undefined : 0,
          zIndex: isDesktop ? undefined : 50,
          overflow: 'hidden',
          backgroundColor: 'hsl(var(--card))',
          backgroundImage: 'none',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Conversation list - hidden on mobile when in chat */}
        <div 
          className={`w-full md:w-80 lg:w-96 border-r border-border flex-shrink-0 min-w-0 ${isInChat ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}
          style={{ 
            overflow: 'hidden',
            height: '100%',
          }}
        >
          <ConversationList />
        </div>
        
        {/* Chat area - full screen on mobile */}
        <div 
          className={`flex-1 min-w-0 ${!isInChat ? 'hidden md:flex' : 'flex'} flex-col`}
          style={{ 
            overflow: 'hidden',
            height: '100%',
          }}
        >
          {isInChat ? (
            <ChatView />
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center text-foreground/80">
              <div className="text-center">
                <p className="text-lg mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">Select a conversation</p>
                <p className="text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">or start a new chat</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
