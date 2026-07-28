import { Loader2, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeleteContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  isDeleting?: boolean;
  kind?: 'post' | 'clip' | 'listing';
  description?: string;
}

export function DeleteContentDialog({
  open,
  onOpenChange,
  onConfirm,
  isDeleting = false,
  kind = 'post',
  description,
}: DeleteContentDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => {
      if (!isDeleting) onOpenChange(next);
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mx-auto mb-2 h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <Trash2 aria-hidden className="h-5 w-5 text-destructive" />
          </div>
          <AlertDialogTitle className="text-center">Delete this {kind}?</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {description || 'This removes it from VYBE permanently, including reactions and comments.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Keep {kind}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
          >
            {isDeleting ? (
              <>
                <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              `Delete ${kind}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
