import { Phone, Video, MessageSquare, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from 'sonner';

interface ExternalCallSheetProps {
  open: boolean;
  onClose: () => void;
  otherUserPhone?: string | null;
  otherUserName?: string;
}

export function ExternalCallSheet({
  open,
  onClose,
  otherUserPhone,
  otherUserName = 'User',
}: ExternalCallSheetProps) {
  const handlePhoneDialer = () => {
    if (otherUserPhone) {
      window.location.href = `tel:${otherUserPhone}`;
    } else {
      toast.error('Phone number not available');
    }
    onClose();
  };

  const handleFaceTime = () => {
    if (otherUserPhone) {
      // FaceTime uses tel: or facetime: protocol
      window.location.href = `facetime:${otherUserPhone}`;
    } else {
      toast.info('FaceTime requires a phone number or email');
    }
    onClose();
  };

  const handleSMS = () => {
    if (otherUserPhone) {
      window.location.href = `sms:${otherUserPhone}`;
    } else {
      toast.error('Phone number not available');
    }
    onClose();
  };

  const handleGoogleMeet = () => {
    // Open Google Meet in a new tab to create a new meeting
    window.open('https://meet.google.com/new', '_blank');
    toast.info(`Share the meeting link with ${otherUserName}`);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-xl">
        <SheetHeader className="text-left">
          <SheetTitle>External Call Options</SheetTitle>
          <SheetDescription>
            Choose an external app to connect with {otherUserName}
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3 mt-6 mb-4">
          {/* Phone Call */}
          <Button
            variant="outline"
            className="flex-col h-auto py-4 gap-2"
            onClick={handlePhoneDialer}
            disabled={!otherUserPhone}
          >
            <div className="p-2 rounded-full bg-green-500/10">
              <Phone className="w-5 h-5 text-green-500" />
            </div>
            <span className="text-sm">Phone Call</span>
          </Button>

          {/* FaceTime */}
          <Button
            variant="outline"
            className="flex-col h-auto py-4 gap-2"
            onClick={handleFaceTime}
          >
            <div className="p-2 rounded-full bg-blue-500/10">
              <Video className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-sm">FaceTime</span>
          </Button>

          {/* SMS */}
          <Button
            variant="outline"
            className="flex-col h-auto py-4 gap-2"
            onClick={handleSMS}
            disabled={!otherUserPhone}
          >
            <div className="p-2 rounded-full bg-purple-500/10">
              <MessageSquare className="w-5 h-5 text-purple-500" />
            </div>
            <span className="text-sm">Text Message</span>
          </Button>

          {/* Google Meet */}
          <Button
            variant="outline"
            className="flex-col h-auto py-4 gap-2"
            onClick={handleGoogleMeet}
          >
            <div className="p-2 rounded-full bg-amber-500/10">
              <ExternalLink className="w-5 h-5 text-amber-500" />
            </div>
            <span className="text-sm">Google Meet</span>
          </Button>
        </div>

        <Button variant="ghost" className="w-full" onClick={onClose}>
          Cancel
        </Button>
      </SheetContent>
    </Sheet>
  );
}
