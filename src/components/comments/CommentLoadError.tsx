import { Button } from '@/components/ui/button';

export function CommentLoadError({ retry, pending }: { retry: () => void; pending: boolean }) {
  return (
    <div role="status" className="rounded-2xl bg-muted/40 p-5 text-center space-y-3">
      <p className="text-sm text-muted-foreground">Comments couldn't load. Your draft is still here.</p>
      <Button type="button" variant="secondary" className="rounded-full" onClick={retry} disabled={pending}>
        {pending ? 'Loading comments…' : 'Retry comments'}
      </Button>
    </div>
  );
}
