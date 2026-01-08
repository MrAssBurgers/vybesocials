import { Routes, Route, useLocation } from 'react-router-dom';
import { ConversationList } from '@/components/chat/ConversationList';
import { ChatView } from '@/components/chat/ChatView';
import { AppLayout } from '@/components/layout/AppLayout';

export default function Messages() {
  const location = useLocation();
  const isInChat = location.pathname !== '/messages';

  return (
    <AppLayout>
      <div className="h-[calc(100vh-5rem)] md:h-screen flex">
        {/* Desktop: Show both list and chat side by side */}
        <div className={`w-full md:w-80 lg:w-96 border-r border-border flex-shrink-0 ${isInChat ? 'hidden md:block' : ''}`}>
          <ConversationList />
        </div>
        
        {/* Chat area */}
        <div className={`flex-1 ${!isInChat ? 'hidden md:flex' : 'flex'} flex-col`}>
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
