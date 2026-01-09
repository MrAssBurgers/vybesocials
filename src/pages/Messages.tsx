import { useLocation } from 'react-router-dom';
import { ConversationList } from '@/components/chat/ConversationList';
import { ChatView } from '@/components/chat/ChatView';
import { AppLayout } from '@/components/layout/AppLayout';
import { useBreakpoint } from '@/hooks/usePlatform';

export default function Messages() {
  const location = useLocation();
  const { isDesktop } = useBreakpoint();
  const isInChat = location.pathname !== '/messages';

  return (
    <AppLayout hideRightSidebar fullWidth>
      <div className="h-[calc(100vh-5rem)] md:h-[calc(100vh-2rem)] lg:h-screen flex overflow-hidden max-w-full">
        {/* Conversation list - hidden on mobile when in chat */}
        <div className={`w-full md:w-80 lg:w-96 border-r border-border flex-shrink-0 overflow-hidden ${isInChat ? 'hidden md:block' : ''}`}>
          <ConversationList />
        </div>
        
        {/* Chat area */}
        <div className={`flex-1 min-w-0 ${!isInChat ? 'hidden md:flex' : 'flex'} flex-col overflow-hidden`}>
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
