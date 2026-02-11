// Interest categories from onboarding mapped to related tags
// When users create custom tags, they auto-categorize into these buckets

export const INTEREST_CATEGORIES = [
  { id: 'comedy', emoji: '😂', label: 'Comedy', tags: ['comedy', 'funny', 'memes', 'humor', 'joke', 'jokes', 'lol', 'lmao', 'skit', 'standup', 'parody'] },
  { id: 'music', emoji: '🎵', label: 'Music', tags: ['music', 'song', 'songs', 'singing', 'rapper', 'rap', 'hiphop', 'rnb', 'rock', 'pop', 'jazz', 'edm', 'beats', 'producer', 'dj', 'guitar', 'piano', 'drums', 'vocals', 'album', 'playlist', 'concert', 'live'] },
  { id: 'dance', emoji: '💃', label: 'Dance', tags: ['dance', 'dancing', 'choreography', 'ballet', 'breakdance', 'twerk', 'popping', 'hiphop', 'contemporary', 'salsa'] },
  { id: 'gaming', emoji: '🎮', label: 'Gaming', tags: ['gaming', 'gamer', 'esports', 'twitch', 'xbox', 'playstation', 'nintendo', 'pc', 'valorant', 'fortnite', 'minecraft', 'roblox', 'cod', 'apex', 'league', 'overwatch', 'stream', 'gameplay'] },
  { id: 'sports', emoji: '⚽', label: 'Sports', tags: ['sports', 'football', 'soccer', 'basketball', 'nba', 'nfl', 'baseball', 'tennis', 'golf', 'boxing', 'mma', 'ufc', 'cricket', 'rugby', 'volleyball', 'swimming', 'skateboarding', 'surfing'] },
  { id: 'food', emoji: '🍕', label: 'Food', tags: ['food', 'cooking', 'recipe', 'recipes', 'chef', 'baking', 'foodie', 'restaurant', 'vegan', 'vegetarian', 'bbq', 'sushi', 'pizza', 'ramen', 'cafe', 'dessert', 'healthy', 'mealprep'] },
  { id: 'travel', emoji: '✈️', label: 'Travel', tags: ['travel', 'traveling', 'travelling', 'vacation', 'adventure', 'explore', 'wanderlust', 'backpacking', 'roadtrip', 'flight', 'hotel', 'tourism', 'beach', 'mountain', 'city', 'abroad'] },
  { id: 'fashion', emoji: '👗', label: 'Fashion', tags: ['fashion', 'outfit', 'outfits', 'style', 'streetwear', 'designer', 'clothing', 'drip', 'sneakers', 'shoes', 'accessories', 'model', 'modeling', 'ootd', 'thrift', 'vintage'] },
  { id: 'beauty', emoji: '💄', label: 'Beauty', tags: ['beauty', 'makeup', 'skincare', 'cosmetics', 'nails', 'hair', 'hairstyle', 'glow', 'tutorial', 'routine', 'grwm', 'fragrance', 'aesthetic'] },
  { id: 'art', emoji: '🎨', label: 'Art', tags: ['art', 'drawing', 'painting', 'sketch', 'illustration', 'design', 'creative', 'digital', 'photography', 'photo', 'photographer', 'graffiti', 'sculpture', 'animation', 'graphicdesign', 'aesthetic'] },
  { id: 'tech', emoji: '💻', label: 'Technology', tags: ['tech', 'technology', 'coding', 'programming', 'software', 'ai', 'machinelearning', 'startup', 'gadgets', 'apple', 'android', 'developer', 'web', 'data', 'crypto', 'blockchain', 'nft', 'robot', 'cybersecurity'] },
  { id: 'fitness', emoji: '💪', label: 'Fitness', tags: ['fitness', 'gym', 'workout', 'exercise', 'bodybuilding', 'crossfit', 'yoga', 'running', 'marathon', 'health', 'muscle', 'gains', 'training', 'cardio', 'wellness', 'nutrition'] },
  { id: 'animals', emoji: '🐶', label: 'Animals', tags: ['animals', 'pets', 'dog', 'dogs', 'cat', 'cats', 'puppy', 'kitten', 'wildlife', 'birds', 'fish', 'aquarium', 'horse', 'horses', 'cute', 'rescue', 'zoo'] },
  { id: 'nature', emoji: '🌿', label: 'Nature', tags: ['nature', 'outdoors', 'hiking', 'camping', 'garden', 'gardening', 'plants', 'flowers', 'landscape', 'sunset', 'sunrise', 'ocean', 'forest', 'mountain', 'earth', 'environment', 'climate'] },
  { id: 'movies', emoji: '🎬', label: 'Movies', tags: ['movies', 'film', 'cinema', 'hollywood', 'netflix', 'streaming', 'tv', 'tvshow', 'series', 'anime', 'marvel', 'starwars', 'horror', 'thriller', 'documentary', 'review', 'kdrama'] },
  { id: 'books', emoji: '📚', label: 'Books', tags: ['books', 'reading', 'book', 'novel', 'fiction', 'nonfiction', 'poetry', 'writing', 'writer', 'author', 'literature', 'library', 'bookworm', 'booktok', 'review'] },
  { id: 'diy', emoji: '🔧', label: 'DIY', tags: ['diy', 'crafts', 'craft', 'handmade', 'woodworking', 'sewing', 'knitting', 'renovation', 'homeimprovement', 'build', 'maker', 'upcycle', 'custom'] },
  { id: 'science', emoji: '🔬', label: 'Science', tags: ['science', 'physics', 'chemistry', 'biology', 'space', 'nasa', 'astronomy', 'research', 'experiment', 'math', 'engineering', 'robotics', 'medicine', 'quantum'] },
  { id: 'news', emoji: '📰', label: 'News', tags: ['news', 'politics', 'breaking', 'current', 'events', 'world', 'journalism', 'media', 'opinion', 'debate', 'economy', 'global'] },
  { id: 'education', emoji: '📖', label: 'Education', tags: ['education', 'learning', 'study', 'studying', 'school', 'college', 'university', 'tutorial', 'howto', 'tips', 'advice', 'motivation', 'mindset', 'productivity', 'career', 'life'] },
] as const;

// Get category IDs that a tag belongs to
export function getTagCategories(tag: string): string[] {
  const normalizedTag = tag.toLowerCase().trim();
  const categories: string[] = [];
  
  for (const cat of INTEREST_CATEGORIES) {
    if ((cat.tags as readonly string[]).includes(normalizedTag) || cat.id === normalizedTag) {
      categories.push(cat.id);
    }
  }
  
  // If no match, the tag is uncategorized (goes to Global only)
  return categories;
}

// Get suggested tags based on user's selected interests
export function getSuggestedTagsForInterests(interests: string[]): { tag: string; emoji: string; category: string }[] {
  const suggestions: { tag: string; emoji: string; category: string }[] = [];
  const seen = new Set<string>();
  
  for (const interest of interests) {
    const cat = INTEREST_CATEGORIES.find(c => c.id === interest);
    if (!cat) continue;
    
    // Pick top tags from this category (not the category name itself)
    for (const tag of cat.tags.slice(0, 6)) {
      if (!seen.has(tag) && tag !== cat.id) {
        seen.add(tag);
        suggestions.push({ tag, emoji: cat.emoji, category: cat.id });
      }
    }
  }
  
  return suggestions;
}

// Check if a tag matches any of the given interests
export function doesTagMatchInterests(tag: string, interests: string[]): boolean {
  const categories = getTagCategories(tag);
  return categories.some(cat => interests.includes(cat)) || interests.includes(tag);
}

// Get all tags for a given set of interests (for the tag picker)
export function getAllTagsForInterests(interests: string[]): string[] {
  const tags = new Set<string>();
  
  for (const interest of interests) {
    const cat = INTEREST_CATEGORIES.find(c => c.id === interest);
    if (cat) {
      cat.tags.forEach(t => tags.add(t));
    }
  }
  
  return Array.from(tags);
}
