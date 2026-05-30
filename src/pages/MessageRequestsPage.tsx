import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { MessageRequestsList } from '@/components/chat/MessageRequestsList';

export default function MessageRequestsPage() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
        <Button
          variant="ghost"
          className="mb-4 -ml-2"
          onClick={() => navigate('/messages')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Messages
        </Button>
        <MessageRequestsList />
      </div>
    </AppLayout>
  );
}
