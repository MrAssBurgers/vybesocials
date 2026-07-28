import { useState } from 'react';
import { Camera, MessagesSquare, PenLine, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { openSnapCamera } from '@/contexts/cameraOverlayActions';
import { useCameraOverlayOptional } from '@/contexts/cameraOverlaySafe';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CreateGroupDialog } from '@/components/chat/CreateGroupDialog';

export function DMComposeButton({ hidden = false }: { hidden?: boolean }) {
  const navigate = useNavigate();
  const cameraOverlay = useCameraOverlayOptional();
  const [open, setOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={cn('dm-inbox-compose dm-vfx-press', hidden && 'dm-inbox-compose--hidden')}
        onClick={() => setOpen(true)}
        aria-label="Compose"
      >
        <PenLine />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="dm-inbox-compose-sheet rounded-t-2xl border-border/40"
        >
          <SheetHeader>
            <SheetTitle>New</SheetTitle>
            <SheetDescription className="sr-only">
              Start a message or group, or send a VYBE Snap.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-1 pb-6">
            <button
              type="button"
              className="dm-inbox-compose-action"
              onClick={() => {
                setOpen(false);
                navigate('/messages/search');
              }}
            >
              <MessagesSquare className="h-5 w-5" />
              <span>New message</span>
            </button>
            <button
              type="button"
              className="dm-inbox-compose-action"
              onClick={() => {
                setOpen(false);
                setGroupOpen(true);
              }}
            >
              <Users className="h-5 w-5" />
              <span>New group</span>
            </button>
            <button
              type="button"
              className="dm-inbox-compose-action"
              onClick={() => {
                setOpen(false);
                if (!cameraOverlay) {
                  navigate('/camera');
                  return;
                }
                openSnapCamera(cameraOverlay.openCamera, {
                  source: 'global',
                  defaultDestination: 'direct',
                  returnRoute: '/messages',
                }, { showBackArrow: true });
              }}
            >
              <Camera className="h-5 w-5" />
              <span>Send VYBE Snap</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <CreateGroupDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        onSuccess={(conversationId) => {
          navigate(`/messages/${conversationId}`);
        }}
      />
    </>
  );
}
