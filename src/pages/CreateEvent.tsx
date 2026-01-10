import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Calendar, Clock, MapPin, Video, Link as LinkIcon, 
  Image, Users, ArrowLeft, Loader2 
} from 'lucide-react';
import { format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCreateEvent } from '@/hooks/useEvents';
import { useAuth } from '@/lib/auth';
import { triggerHaptic } from '@/lib/haptics';
import { toast } from 'sonner';

export default function CreateEventPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const createEvent = useCreateEvent();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<'in-person' | 'online'>('in-person');
  const [location, setLocation] = useState('');
  const [onlineLink, setOnlineLink] = useState('');
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('21:00');
  const [maxAttendees, setMaxAttendees] = useState<string>('');
  const [isPublic, setIsPublic] = useState(true);
  const [coverImage, setCoverImage] = useState('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile) {
      toast.error('Please sign in to create an event');
      return;
    }
    
    if (!title.trim()) {
      toast.error('Please enter an event title');
      return;
    }
    
    if (!date) {
      toast.error('Please select a date');
      return;
    }
    
    if (eventType === 'in-person' && !location.trim()) {
      toast.error('Please enter a location for in-person events');
      return;
    }
    
    if (eventType === 'online' && !onlineLink.trim()) {
      toast.error('Please enter a link for online events');
      return;
    }
    
    // Combine date with time
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startDateTime = new Date(date);
    startDateTime.setHours(startHour, startMin, 0, 0);
    
    const endDateTime = new Date(date);
    endDateTime.setHours(endHour, endMin, 0, 0);
    
    triggerHaptic('medium');
    
    try {
      await createEvent.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        event_type: eventType,
        location: eventType === 'in-person' ? location.trim() : null,
        online_link: eventType === 'online' ? onlineLink.trim() : null,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
        is_public: isPublic,
        cover_image: coverImage || null,
      });
      
      toast.success('Event created successfully!');
      navigate('/events');
    } catch (error) {
      toast.error('Failed to create event');
    }
  };
  
  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create Event</h1>
            <p className="text-muted-foreground text-sm">
              Host an event for your community
            </p>
          </div>
        </div>
        
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* Event Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Event Title *</Label>
            <Input
              id="title"
              placeholder="Give your event a name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg"
            />
          </div>
          
          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Tell people what your event is about..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
          
          {/* Event Type */}
          <div className="space-y-3">
            <Label>Event Type *</Label>
            <RadioGroup
              value={eventType}
              onValueChange={(v) => setEventType(v as 'in-person' | 'online')}
              className="flex gap-4"
            >
              <div className={cn(
                "flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer flex-1 transition-all",
                eventType === 'in-person' 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50"
              )}>
                <RadioGroupItem value="in-person" id="in-person" />
                <Label htmlFor="in-person" className="flex items-center gap-2 cursor-pointer">
                  <MapPin className="h-5 w-5 text-green-500" />
                  In-Person
                </Label>
              </div>
              <div className={cn(
                "flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer flex-1 transition-all",
                eventType === 'online' 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50"
              )}>
                <RadioGroupItem value="online" id="online" />
                <Label htmlFor="online" className="flex items-center gap-2 cursor-pointer">
                  <Video className="h-5 w-5 text-blue-500" />
                  Online
                </Label>
              </div>
            </RadioGroup>
          </div>
          
          {/* Location or Link */}
          {eventType === 'in-person' ? (
            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="location"
                  placeholder="Enter the venue address"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="onlineLink">Event Link *</Label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="onlineLink"
                  placeholder="Zoom, Discord, or streaming link"
                  value={onlineLink}
                  onChange={(e) => setOnlineLink(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          )}
          
          {/* Date & Time */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time *</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endTime">End Time</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
          
          {/* Cover Image */}
          <div className="space-y-2">
            <Label htmlFor="coverImage">Cover Image URL</Label>
            <div className="relative">
              <Image className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="coverImage"
                placeholder="https://example.com/image.jpg"
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          {/* Max Attendees */}
          <div className="space-y-2">
            <Label htmlFor="maxAttendees">Max Attendees (optional)</Label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="maxAttendees"
                type="number"
                placeholder="Leave empty for unlimited"
                value={maxAttendees}
                onChange={(e) => setMaxAttendees(e.target.value)}
                className="pl-10"
                min={1}
              />
            </div>
          </div>
          
          {/* Public Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl border">
            <div>
              <Label>Public Event</Label>
              <p className="text-sm text-muted-foreground">
                Anyone can see and RSVP to this event
              </p>
            </div>
            <Switch
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>
          
          {/* Submit */}
          <Button
            type="submit"
            className="w-full gradient-animated text-white"
            size="lg"
            disabled={createEvent.isPending}
          >
            {createEvent.isPending ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Calendar className="h-5 w-5 mr-2" />
                Create Event
              </>
            )}
          </Button>
        </motion.form>
      </div>
    </AppLayout>
  );
}
