import { MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function FeedbackButton() {
  return (
    <Button variant="ghost" size="sm" className="gap-2" asChild>
      <Link to="/feedback">
        <MessageSquarePlus className="h-4 w-4" />
        <span>Feedback</span>
      </Link>
    </Button>
  );
}
