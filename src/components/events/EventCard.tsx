import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Calendar, 
  MapPin, 
  Video, 
  Users, 
  Share2, 
  CalendarPlus, 
  Play,
  CheckCircle2,
  Star,
  ExternalLink
} from 'lucide-react';
import { format, isPast, isFuture } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { GlobalEvent, useEventRSVP, useTrackSponsorEvent } from '@/hooks/useGlobalEvents';
import { useAuth } from '@/lib/auth';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface EventCardProps {
  event: GlobalEvent;
  compact?: boolean;
}

export const EventCard = memo(function EventCard({ event, compact = false }: EventCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const rsvpMutation = useEventRSVP();
  const trackEvent = useTrackSponsorEvent();
  const [isSharing, setIsSharing] = useState(false);

  const isLive = event.live_url && 
    new Date(event.start_time) <= new Date() && 
    (!event.end_time || new Date(event.end_time) > new Date());
  
  const hasReplay = event.replay_url && isPast(new Date(event.end_time || event.start_time));
  const isUpcoming = isFuture(new Date(event.start_time));

  const handleRSVP = async (status: 'going' | 'interested') => {
    if (!user) {
      toast.error('Sign in to RSVP');
      return;
    }

    triggerHaptic('light');
    
    const newStatus = event.user_rsvp === status ? null : status;
    
    try {
      await rsvpMutation.mutateAsync({ eventId: event.id, status: newStatus });
      
      // Track sponsor analytics
      if (event.sponsor_id && newStatus) {
        trackEvent.mutate({
          sponsorId: event.sponsor_id,
          contentType: 'event',
          contentId: event.id,
          eventType: 'rsvp',
        });
      }
      
      toast.success(newStatus ? `You're ${status}!` : 'RSVP removed');
    } catch (error) {
      toast.error('Failed to update RSVP');
    }
  };

  const handleShare = async () => {
    setIsSharing(true);
    triggerHaptic('light');

    try {
      const shareUrl = `${window.location.origin}/events/${event.id}`;
      
      if (navigator.share) {
        await navigator.share({
          title: event.title,
          text: event.description || `Check out this event: ${event.title}`,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Link copied!');
      }

      // Track sponsor analytics
      if (event.sponsor_id) {
        trackEvent.mutate({
          sponsorId: event.sponsor_id,
          contentType: 'event',
          contentId: event.id,
          eventType: 'share',
        });
      }
    } catch (error) {
      // User cancelled share
    } finally {
      setIsSharing(false);
    }
  };

  const handleAddToCalendar = () => {
    triggerHaptic('light');
    
    const startDate = new Date(event.start_time);
    const endDate = event.end_time ? new Date(event.end_time) : new Date(startDate.getTime() + 3600000);
    
    // Create ICS format
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:${startDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTEND:${endDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z
SUMMARY:${event.title}
DESCRIPTION:${event.description || ''}
LOCATION:${event.location || event.online_link || ''}
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.title.replace(/\s+/g, '_')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success('Calendar event downloaded');
  };

  const handleJoinLive = () => {
    triggerHaptic('medium');
    
    if (event.sponsor_id) {
      trackEvent.mutate({
        sponsorId: event.sponsor_id,
        contentType: 'event',
        contentId: event.id,
        eventType: 'join',
      });
    }
    
    if (event.live_url) {
      window.open(event.live_url, '_blank');
    }
  };

  const handleWatchReplay = () => {
    triggerHaptic('light');
    
    if (event.sponsor_id) {
      trackEvent.mutate({
        sponsorId: event.sponsor_id,
        contentType: 'event',
        contentId: event.id,
        eventType: 'click',
      });
    }
    
    if (event.replay_url) {
      window.open(event.replay_url, '_blank');
    }
  };

  if (compact) {
    return (
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => navigate(`/events/${event.id}`)}
        className={cn(
          "w-full text-left p-4 rounded-xl",
          "liquid-glass-card border border-border/50",
          "transition-all duration-200 hover:border-primary/30"
        )}
      >
        <div className="flex items-center gap-3">
          {event.cover_image ? (
            <img
              src={event.cover_image}
              alt=""
              className="h-12 w-12 rounded-lg object-cover"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {event.sponsor && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Sponsored
                </Badge>
              )}
              {isLive && (
                <Badge className="text-[10px] px-1.5 py-0 bg-red-500">
                  LIVE
                </Badge>
              )}
            </div>
            <h3 className="font-medium text-sm line-clamp-1">{event.title}</h3>
            <p className="text-xs text-muted-foreground">
              {format(new Date(event.start_time), 'MMM d, h:mm a')}
            </p>
          </div>
          
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </div>
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden">
        {/* Cover Image */}
        {event.cover_image && (
          <div className="relative h-40 w-full">
            <img
              src={event.cover_image}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
            
            {/* Status badges */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              {event.sponsor && (
                <Badge variant="secondary" className="backdrop-blur-sm bg-background/80">
                  Sponsored
                </Badge>
              )}
              {isLive && (
                <Badge className="bg-red-500 animate-pulse">
                  🔴 LIVE NOW
                </Badge>
              )}
              {hasReplay && (
                <Badge variant="outline" className="backdrop-blur-sm bg-background/80">
                  Replay Available
                </Badge>
              )}
            </div>
          </div>
        )}

        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h3 
                className="font-semibold text-lg line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                onClick={() => navigate(`/events/${event.id}`)}
              >
                {event.title}
              </h3>
              
              {event.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {event.description}
                </p>
              )}
            </div>
          </div>

          {/* Event details */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(event.start_time), 'EEEE, MMMM d • h:mm a')}</span>
            </div>
            
            {event.location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span className="line-clamp-1">{event.location}</span>
              </div>
            )}
            
            {event.event_type === 'online' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Video className="h-4 w-4" />
                <span>Online Event</span>
              </div>
            )}
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{event.rsvp_count} going</span>
              {event.max_attendees && (
                <span className="text-xs">• {event.max_attendees - (event.rsvp_count || 0)} spots left</span>
              )}
            </div>
          </div>

          {/* Host info */}
          {event.host && (
            <div 
              className="flex items-center gap-2 mb-4 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate(`/profile/${event.host!.username}`)}
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={event.host.avatar_url || undefined} />
                <AvatarFallback>
                  {event.host.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium flex items-center gap-1">
                  {event.host.username}
                  {event.host.is_verified && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary fill-primary" />
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Host</p>
              </div>
            </div>
          )}

          {/* Sponsor info */}
          {event.sponsor && (
            <div className="flex items-center gap-2 mb-4 p-2 rounded-lg bg-muted/30">
              {event.sponsor.company_logo ? (
                <img
                  src={event.sponsor.company_logo}
                  alt={event.sponsor.company_name}
                  className="h-8 w-8 rounded object-contain"
                />
              ) : (
                <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                  <Star className="h-4 w-4 text-primary" />
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Sponsored by</p>
                <p className="text-sm font-medium flex items-center gap-1">
                  {event.sponsor.company_name}
                  {event.sponsor.is_verified && (
                    <CheckCircle2 className="h-3 w-3 text-primary fill-primary" />
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {isLive && event.live_url && (
              <Button 
                onClick={handleJoinLive}
                className="flex-1 bg-red-500 hover:bg-red-600"
              >
                <Play className="h-4 w-4 mr-2" />
                Join Live
              </Button>
            )}
            
            {hasReplay && event.replay_url && (
              <Button 
                variant="secondary"
                onClick={handleWatchReplay}
                className="flex-1"
              >
                <Play className="h-4 w-4 mr-2" />
                Watch Replay
              </Button>
            )}
            
            {isUpcoming && (
              <>
                <Button
                  variant={event.user_rsvp === 'going' ? 'default' : 'outline'}
                  onClick={() => handleRSVP('going')}
                  disabled={rsvpMutation.isPending}
                  className="flex-1"
                >
                  {event.user_rsvp === 'going' ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Going
                    </>
                  ) : (
                    'RSVP Going'
                  )}
                </Button>
                
                <Button
                  variant={event.user_rsvp === 'interested' ? 'secondary' : 'ghost'}
                  onClick={() => handleRSVP('interested')}
                  disabled={rsvpMutation.isPending}
                  size="icon"
                >
                  <Star className={cn(
                    "h-4 w-4",
                    event.user_rsvp === 'interested' && "fill-current text-yellow-500"
                  )} />
                </Button>
              </>
            )}
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleAddToCalendar}
            >
              <CalendarPlus className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShare}
              disabled={isSharing}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});
