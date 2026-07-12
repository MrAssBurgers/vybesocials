import { PenLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function DMComposeButton({ hidden = false }: { hidden?: boolean }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className={cn('dm-inbox-compose', hidden && 'dm-inbox-compose--hidden')}
      onClick={() => navigate('/messages/new')}
      aria-label="Start a new chat"
    >
      <PenLine />
    </button>
  );
}
