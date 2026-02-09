import { useState, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Search, Filter, Grid, List, Heart, MapPin, 
  Plus, Tag, ChevronDown, Loader2, ShoppingBag, Store
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CreateBusinessDialog } from '@/components/business/CreateBusinessDialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useListings, LISTING_CATEGORIES, LISTING_CONDITIONS, useToggleFavorite, useListingFavorites } from '@/hooks/useMarketplace';
import { useRealtimeListings } from '@/hooks/useRealtimeListings';
import { useAuth } from '@/lib/auth';
import { triggerHaptic } from '@/lib/haptics';

const ListingCard = memo(function ListingCard({ 
  listing, 
  viewMode,
  isFavorite,
  onToggleFavorite,
  index = 0,
}: { 
  listing: any; 
  viewMode: 'grid' | 'list';
  isFavorite: boolean;
  onToggleFavorite: () => void;
  index?: number;
}) {
  const category = LISTING_CATEGORIES.find(c => c.value === listing.category);

  if (viewMode === 'list') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ 
          duration: 0.3, 
          delay: index * 0.05,
          type: 'spring',
          stiffness: 400,
          damping: 25
        }}
        whileHover={{ scale: 1.01, y: -2 }}
        whileTap={{ scale: 0.99 }}
        className="liquid-glass-card p-4 flex gap-4"
      >
        <Link to={`/market/${listing.id}`} className="shrink-0">
          <motion.div 
            className="w-24 h-24 rounded-lg overflow-hidden bg-muted"
            whileHover={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            {listing.images?.[0] ? (
              <img 
                src={listing.images[0]} 
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl">
                {category?.icon || '📦'}
              </div>
            )}
          </motion.div>
        </Link>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link to={`/market/${listing.id}`} className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{listing.title}</h3>
              <motion.p 
                className="text-lg font-bold text-primary"
                initial={{ scale: 1 }}
                whileHover={{ scale: 1.05 }}
              >
                {listing.price === 0 ? 'Free' : `$${listing.price.toLocaleString()}`}
              </motion.p>
            </Link>
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.85 }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.preventDefault();
                  triggerHaptic('light');
                  onToggleFavorite();
                }}
                className="shrink-0"
              >
                <motion.div
                  animate={isFavorite ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  <Heart className={cn('h-5 w-5 transition-colors', isFavorite && 'fill-primary text-primary')} />
                </motion.div>
              </Button>
            </motion.div>
          </div>
          
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="text-xs">
              {category?.label}
            </Badge>
            {listing.location && (
              <motion.span 
                className="flex items-center gap-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <MapPin className="h-3 w-3" />
                {listing.location}
              </motion.span>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -20 }}
      transition={{ 
        duration: 0.4, 
        delay: index * 0.05,
        type: 'spring',
        stiffness: 300,
        damping: 25
      }}
      whileHover={{ y: -8, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="liquid-glass-card overflow-hidden group cursor-pointer"
    >
      <Link to={`/market/${listing.id}`} className="block">
        <div className="aspect-square relative overflow-hidden bg-muted">
          {listing.images?.[0] ? (
            <motion.img 
              src={listing.images[0]} 
              alt={listing.title}
              className="w-full h-full object-cover"
              whileHover={{ scale: 1.1 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          ) : (
            <motion.div 
              className="w-full h-full flex items-center justify-center text-4xl"
              whileHover={{ scale: 1.2, rotate: 5 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              {category?.icon || '📦'}
            </motion.div>
          )}
          
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            whileHover={{ opacity: 1, scale: 1 }}
            className="absolute top-2 right-2"
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                triggerHaptic('light');
                onToggleFavorite();
              }}
              className="bg-background/80 backdrop-blur-sm hover:bg-background/90"
            >
              <motion.div
                animate={isFavorite ? { 
                  scale: [1, 1.4, 1],
                  rotate: [0, -10, 10, 0]
                } : {}}
                transition={{ duration: 0.4 }}
              >
                <Heart className={cn('h-4 w-4 transition-colors', isFavorite && 'fill-primary text-primary')} />
              </motion.div>
            </Button>
          </motion.div>
          
          {listing.condition === 'new' && (
            <motion.div
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 400 }}
            >
              <Badge className="absolute top-2 left-2 bg-success text-success-foreground">New</Badge>
            </motion.div>
          )}
          
          {/* Shimmer overlay on hover */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            initial={{ x: '-100%' }}
            whileHover={{ x: '100%' }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          />
        </div>
      </Link>
      
      <motion.div 
        className="p-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 + 0.1 }}
      >
        <Link to={`/market/${listing.id}`}>
          <motion.p 
            className="text-lg font-bold text-primary"
            whileHover={{ scale: 1.05, x: 5 }}
            transition={{ type: 'spring', stiffness: 400 }}
          >
            {listing.price === 0 ? 'Free' : `$${listing.price.toLocaleString()}`}
          </motion.p>
          <h3 className="font-medium truncate">{listing.title}</h3>
        </Link>
        
        <motion.div 
          className="flex items-center gap-2 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: index * 0.05 + 0.2 }}
        >
          <Link to={`/u/${listing.seller?.username}`} className="flex items-center gap-1.5 group/seller">
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
              <Avatar className="h-5 w-5">
                <AvatarImage src={listing.seller?.avatar_url} />
                <AvatarFallback className="text-xs">
                  {listing.seller?.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </motion.div>
            <span className="text-xs text-muted-foreground truncate group-hover/seller:text-foreground transition-colors">
              {listing.seller?.username}
            </span>
          </Link>
        </motion.div>
      </motion.div>
    </motion.div>
  );
});

export default function MarketPage() {
  const { profile } = useAuth();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');
  const [condition, setCondition] = useState<string>('');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [showBusinessDialog, setShowBusinessDialog] = useState(false);

  const filters = useMemo(() => ({
    search: search || undefined,
    category: category || undefined,
    condition: condition || undefined,
    minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
    maxPrice: priceRange[1] < 10000 ? priceRange[1] : undefined,
  }), [search, category, condition, priceRange]);

  const { data: listings, isLoading } = useListings(filters);
  const { data: favorites } = useListingFavorites();
  const toggleFavorite = useToggleFavorite();
  
  // Enable real-time updates for listings
  useRealtimeListings();

  const favoriteIds = useMemo(() => 
    new Set(favorites?.map(f => f.id) || []), 
    [favorites]
  );

  return (
    <AppLayout>
      <motion.div 
        className="max-w-7xl mx-auto px-4 py-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <motion.div 
          className="flex items-center justify-between mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div>
            <motion.h1 
              className="text-2xl font-bold flex items-center gap-2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <ShoppingBag className="h-6 w-6 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
              </motion.div>
              <span className="text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">VYBE Market</span>
            </motion.h1>
            <motion.p 
              className="text-foreground/80 text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Buy and sell with your community
            </motion.p>
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.25, type: 'spring', stiffness: 400 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button 
                variant="outline" 
                onClick={() => setShowBusinessDialog(true)}
                className="gap-2"
              >
                <Store className="h-4 w-4" />
                <span className="hidden sm:inline">Start a Business</span>
                <span className="sm:hidden">Business</span>
              </Button>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 400 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link to="/market/new">
                <Button className="gradient-animated text-primary-foreground">
                  <Plus className="h-4 w-4 mr-2" />
                  Sell Item
                </Button>
              </Link>
            </motion.div>
          </div>
        </motion.div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search marketplace..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 liquid-glass-input"
            />
          </div>
          
          <div className="flex gap-2">
            <Select value={category || 'all'} onValueChange={(v) => setCategory(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {LISTING_CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.icon} {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="space-y-6 py-6">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Condition</label>
                    <Select value={condition || 'all'} onValueChange={(v) => setCondition(v === 'all' ? '' : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Any condition" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any Condition</SelectItem>
                        {LISTING_CONDITIONS.map(cond => (
                          <SelectItem key={cond.value} value={cond.value}>
                            {cond.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium mb-2 block">Price Range</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={priceRange[0]}
                        onChange={(e) => setPriceRange([+e.target.value, priceRange[1]])}
                        className="w-24"
                      />
                      <span>-</span>
                      <Input
                        type="number"
                        placeholder="Max"
                        value={priceRange[1]}
                        onChange={(e) => setPriceRange([priceRange[0], +e.target.value])}
                        className="w-24"
                      />
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            
            <div className="flex border rounded-lg overflow-hidden">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Categories Quick Filter */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-6 no-scrollbar">
          <Button
            variant={!category ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategory('')}
            className="shrink-0"
          >
            All
          </Button>
          {LISTING_CATEGORIES.map(cat => (
            <Button
              key={cat.value}
              variant={category === cat.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategory(cat.value)}
              className="shrink-0"
            >
              {cat.icon} {cat.label}
            </Button>
          ))}
        </div>

        {/* Listings Grid */}
        {isLoading ? (
          <motion.div 
            className={cn(
              viewMode === 'grid' 
                ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
                : 'space-y-4'
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
              >
                <Skeleton className={viewMode === 'grid' ? 'aspect-square rounded-xl' : 'h-32 rounded-xl'} />
              </motion.div>
            ))}
          </motion.div>
        ) : listings && listings.length > 0 ? (
          <motion.div 
            className={cn(
              viewMode === 'grid' 
                ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
                : 'space-y-4'
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <AnimatePresence mode="popLayout">
              {listings.map((listing, index) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  viewMode={viewMode}
                  isFavorite={favoriteIds.has(listing.id)}
                  onToggleFavorite={() => toggleFavorite.mutate({ 
                    listingId: listing.id, 
                    isFavorite: favoriteIds.has(listing.id) 
                  })}
                  index={index}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <EmptyState
              emoji="🛒"
              title="No listings found"
              description={search || category ? "Try adjusting your filters" : "Be the first to list something!"}
              actionLabel="Create Listing"
              onAction={() => window.location.href = '/market/new'}
            />
          </motion.div>
        )}
        
        {/* Business Creation Dialog */}
        <CreateBusinessDialog 
          open={showBusinessDialog} 
          onOpenChange={setShowBusinessDialog} 
        />
      </motion.div>
    </AppLayout>
  );
}
