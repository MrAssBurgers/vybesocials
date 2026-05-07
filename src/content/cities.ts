export interface CityInfo {
  slug: string;
  name: string;
  region: string;
  country: string;
  countryCode: string;
  blurb: string;
  vibes: string[];
}

export const CITIES: CityInfo[] = [
  { slug: 'new-york', name: 'New York', region: 'NY', country: 'United States', countryCode: 'US', blurb: 'From Brooklyn rooftops to Manhattan streetwear drops, NYC creators set the pace on VYBE.', vibes: ['Streetwear', 'Nightlife', 'Hip-hop', 'Foodie'] },
  { slug: 'los-angeles', name: 'Los Angeles', region: 'CA', country: 'United States', countryCode: 'US', blurb: 'Beach clips, studio sessions, and viral moments — LA on VYBE never sleeps.', vibes: ['Music', 'Surf', 'Studio', 'Wellness'] },
  { slug: 'london', name: 'London', region: 'England', country: 'United Kingdom', countryCode: 'GB', blurb: 'Drill, fashion week, and underground gigs — London creators bring the energy.', vibes: ['Fashion', 'Drill', 'Indie', 'Pubs'] },
  { slug: 'tokyo', name: 'Tokyo', region: 'Tokyo', country: 'Japan', countryCode: 'JP', blurb: 'Shibuya neon, anime culture, city-pop — Tokyo creators light up the feed.', vibes: ['Anime', 'J-pop', 'Street', 'Tech'] },
  { slug: 'paris', name: 'Paris', region: 'Île-de-France', country: 'France', countryCode: 'FR', blurb: 'Cafés, couture, and cinematic clips from across the City of Light.', vibes: ['Fashion', 'Art', 'Café', 'Film'] },
  { slug: 'berlin', name: 'Berlin', region: 'Berlin', country: 'Germany', countryCode: 'DE', blurb: 'Techno, street art, and creative chaos — Berlin keeps it raw on VYBE.', vibes: ['Techno', 'Art', 'Underground', 'Skate'] },
  { slug: 'sydney', name: 'Sydney', region: 'NSW', country: 'Australia', countryCode: 'AU', blurb: 'Beaches, surf clips, and creator collabs from Bondi to the Inner West.', vibes: ['Surf', 'Beach', 'Music', 'Outdoors'] },
  { slug: 'toronto', name: 'Toronto', region: 'ON', country: 'Canada', countryCode: 'CA', blurb: 'The 6 brings hip-hop, fashion, and a thriving creator scene to VYBE.', vibes: ['Hip-hop', 'Fashion', 'Foodie', 'Sports'] },
  { slug: 'mumbai', name: 'Mumbai', region: 'MH', country: 'India', countryCode: 'IN', blurb: 'Bollywood energy, street food, and rising creators across India\'s capital of dreams.', vibes: ['Bollywood', 'Street Food', 'Music', 'Fashion'] },
  { slug: 'sao-paulo', name: 'São Paulo', region: 'SP', country: 'Brazil', countryCode: 'BR', blurb: 'Funk, futebol, and 24/7 street energy — São Paulo creators bring the heat.', vibes: ['Funk', 'Futebol', 'Street Art', 'Nightlife'] },
  { slug: 'dubai', name: 'Dubai', region: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', blurb: 'Skyline shots, luxury vibes, and global creators all converging in Dubai.', vibes: ['Luxury', 'Travel', 'Cars', 'Skyline'] },
  { slug: 'mexico-city', name: 'Mexico City', region: 'CDMX', country: 'Mexico', countryCode: 'MX', blurb: 'Tacos, lucha libre, and a creative renaissance lighting up CDMX.', vibes: ['Foodie', 'Music', 'Art', 'Culture'] },
];

export const getCity = (slug: string) => CITIES.find((c) => c.slug === slug);
