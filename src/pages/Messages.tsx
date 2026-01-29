import { useLocation } from 'react-router-dom';
import { ConversationList } from '@/components/chat/ConversationList';
import { ChatView } from '@/components/chat/ChatView';
import { AppLayout } from '@/components/layout/AppLayout';
import { useBreakpoint } from '@/hooks/usePlatform';

export default function Messages() {
  const location = useLocation();
  const { isDesktop } = useBreakpoint();
  const isInChat = location.pathname !== '/messages';

  // On mobile, when in a chat, hide nav for immersive full-screen experience (Instagram-style)
  const hideNavOnMobile = isInChat && !isDesktop;

  return (
    <AppLayout hideRightSidebar fullWidth hideNav={hideNavOnMobile} noPadding>
      <div 
        className={`
          ${hideNavOnMobile 
            ? 'h-[100dvh] fixed inset-0 z-50' 
            : 'h-[calc(100dvh-4rem)] md:h-screen'
          } 
          flex max-w-full bg-background
        `}
        style={{ overflow: 'hidden' }}
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
            <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p className="text-lg mb-2">Select a conversation</p>
                <p className="text-sm">or start a new chat</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
