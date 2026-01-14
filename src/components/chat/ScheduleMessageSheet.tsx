import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  Clock, 
  Calendar as CalendarIcon,
  Send,
  X
} from 'lucide-react';
import { useScheduledMessages } from '@/hooks/useDMSettings';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ScheduleMessageSheetProps {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScheduleMessageSheet({ conversationId, open, onOpenChange }: ScheduleMessageSheetProps) {
  const { scheduledMessages, scheduleMessage, cancelScheduledMessage } = useScheduledMessages(conversationId);
  const [content, setContent] = useState('');
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState('12:00');

  const handleSchedule = () => {
    if (!content.trim() || !date) {
      toast.error('Please enter a message and select a date');
      return;
    }

    const [hours, minutes] = time.split(':').map(Number);
    const scheduledAt = new Date(date);
    scheduledAt.setHours(hours, minutes, 0, 0);

    if (scheduledAt <= new Date()) {
      toast.error('Please select a future date and time');
      return;
    }

    scheduleMessage({ content: content.trim(), scheduledAt });
    setContent('');
    setDate(undefined);
    setTime('12:00');
    toast.success('Message scheduled! 📅');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Schedule Message
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          {/* Message input */}
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your message..."
              rows={3}
            />
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <Label>Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !date && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time picker */}
          <div className="space-y-2">
            <Label>Time</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          <Button onClick={handleSchedule} className="w-full gap-2">
            <Send className="h-4 w-4" />
            Schedule Message
          </Button>

          {/* Scheduled messages list */}
          {scheduledMessages.length > 0 && (
            <div className="space-y-2 pt-4 border-t border-border">
              <Label>Pending Messages</Label>
              {scheduledMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted"
                >
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{msg.content}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(msg.scheduled_at), 'PPp')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={() => cancelScheduledMessage(msg.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
