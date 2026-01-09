import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Heart, Share2, MapPin, MessageCircle, Flag, MoreVertical, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useListing, useToggleFavorite, useListingFavorites, LISTING_CATEGORIES, LISTING_CONDITIONS, useDeleteListing } from '@/hooks/useMarketplace';
import { useAuth } from '@/lib/auth';
import { useCreateConversation } from '@/hooks/useMessages';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MediaFallback } from '@/components/ui/MediaFallback';
import { useState } from 'react';

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: listing, isLoading, error } = useListing(id!);
  const { data: favorites } = useListingFavorites();
  const toggleFavorite = useToggleFavorite();
  const deleteListing = useDeleteListing();
  const createConversation = useCreateConversation();
  const [currentImage, setCurrentImage] = useState(0);
  const [imageError, setImageError] = useState(false);

  const isFavorite = favorites?.some(f => f.id === id) || false;
  const isOwner = profile?.id === listing?.seller_id;
  const category = LISTING_CATEGORIES.find(c => c.value === listing?.category);
  const condition = LISTING_CONDITIONS.find(c => c.value === listing?.condition);

  const handleShare = async () => {
    const url = `${window.location.origin}/market/${id}`;
    if (navigator.share) {
      await navigator.share({ title: listing?.title, url });
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Link copied!');
    }
  };

  const handleMessage = async () => {
    if (!listing?.seller?.id) return;
    try {
      const conv = await createConversation.mutateAsync({ memberIds: [listing.seller.id] });
      navigate(`/messages/${conv.id}`);
    } catch (error) {
      toast.error('Failed to start conversation');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this listing?')) return;
    try {
      await deleteListing.mutateAsync(id!);
      toast.success('Listing deleted');
      navigate('/market');
    } catch {
      toast.error('Failed to delete listing');
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Skeleton className="h-80 w-full rounded-xl mb-4" />
          <Skeleton className="h-8 w-3/4 mb-2" />
          <Skeleton className="h-6 w-1/4 mb-4" />
          <Skeleton className="h-20 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (error || !listing) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-6xl">🛒</p>
          <h2 className="text-xl font-semibold">Listing not found</h2>
          <Button onClick={() => navigate('/market')}>Back to Market</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleFavorite.mutate({ listingId: id!, isFavorite })}
            >
              <Heart className={cn('h-5 w-5', isFavorite && 'fill-primary text-primary')} />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleShare}>
              <Share2 className="h-5 w-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOwner && (
                  <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Listing
                  </DropdownMenuItem>
                )}
                {!isOwner && (
                  <DropdownMenuItem className="text-destructive">
                    <Flag className="h-4 w-4 mr-2" />
                    Report Listing
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Images */}
        <div className="aspect-square bg-muted relative overflow-hidden">
          {listing.images && listing.images.length > 0 && !imageError ? (
            <>
              <img
                src={listing.images[currentImage]}
                alt={listing.title}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
              {listing.images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {listing.images.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImage(idx)}
                      className={cn(
                        'w-2 h-2 rounded-full transition-colors',
                        idx === currentImage ? 'bg-white' : 'bg-white/50'
                      )}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <MediaFallback type="image" caption={listing.title} className="h-full" />
          )}
        </div>

        {/* Details */}
        <div className="px-4 py-6 space-y-6">
          {/* Price & Title */}
          <div>
            <p className="text-3xl font-bold text-primary">
              {listing.price === 0 ? 'Free' : `$${listing.price.toLocaleString()}`}
            </p>
            <h1 className="text-xl font-semibold mt-1">{listing.title}</h1>
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {category?.icon} {category?.label}
            </Badge>
            <Badge variant="outline">{condition?.label}</Badge>
            {listing.location && (
              <Badge variant="outline">
                <MapPin className="h-3 w-3 mr-1" />
                {listing.location}
              </Badge>
            )}
          </div>

          {/* Description */}
          {listing.description && (
            <div>
              <h3 className="font-medium mb-2">Description</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{listing.description}</p>
            </div>
          )}

          {/* Seller */}
          <div className="liquid-glass-card p-4">
            <Link to={`/u/${listing.seller?.username}`} className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={listing.seller?.avatar_url || undefined} />
                <AvatarFallback>{listing.seller?.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium">{listing.seller?.username}</p>
                <p className="text-sm text-muted-foreground">
                  Listed {formatDistanceToNow(new Date(listing.created_at), { addSuffix: true })}
                </p>
              </div>
            </Link>
          </div>

          {/* Action Buttons */}
          {!isOwner && (
            <Button
              className="w-full gradient-animated text-white"
              size="lg"
              onClick={handleMessage}
            >
              <MessageCircle className="h-5 w-5 mr-2" />
              Message Seller
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
