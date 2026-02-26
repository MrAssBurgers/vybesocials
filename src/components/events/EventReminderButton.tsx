import { useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEventReminder, useSetEventReminder, useRemoveEventReminder } from '@/hooks/useEventReminders';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface EventReminderButtonProps {
  eventId: string;
  eventStartTime: string;
  size?: 'sm' | 'default';
}

export function EventReminderButton({ eventId, eventStartTime, size = 'sm' }: EventReminderButtonProps) {
  const { data: reminder } = useEventReminder(eventId);
  const setReminder = useSetEventReminder();
  const removeReminder = useRemoveEventReminder();
  const hasReminder = !!reminder;

  const eventDate = new Date(eventStartTime);

  const reminderOptions = [
    { label: '15 min before', minutes: 15 },
    { label: '1 hour before', minutes: 60 },
    { label: '1 day before', minutes: 1440 },
  ].filter(opt => {
    const remindAt = new Date(eventDate.getTime() - opt.minutes * 60000);
    return remindAt > new Date(); // Only show future reminders
  });

  const handleSet = (minutes: number) => {
    const remindAt = new Date(eventDate.getTime() - minutes * 60000);
    triggerHaptic('light');
    setReminder.mutate({ eventId, remindAt });
  };

  const handleRemove = () => {
    triggerHaptic('light');
    removeReminder.mutate(eventId);
  };

  if (hasReminder) {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={handleRemove}
        className="gap-1.5 text-primary border-primary/30"
      >
        <BellRing className="h-3.5 w-3.5" />
        Reminder Set
      </Button>
    );
  }

  if (reminderOptions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size} className="gap-1.5">
          <Bell className="h-3.5 w-3.5" />
          Remind Me
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {reminderOptions.map(opt => (
          <DropdownMenuItem key={opt.minutes} onClick={() => handleSet(opt.minutes)}>
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
