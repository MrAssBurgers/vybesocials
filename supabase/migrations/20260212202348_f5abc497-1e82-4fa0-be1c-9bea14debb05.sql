
-- Drop the old check constraint
ALTER TABLE public.battle_pass_tiers DROP CONSTRAINT battle_pass_tiers_reward_type_check;

-- Add updated check constraint with new types
ALTER TABLE public.battle_pass_tiers ADD CONSTRAINT battle_pass_tiers_reward_type_check 
  CHECK (reward_type = ANY (ARRAY['badge'::text, 'cosmetic'::text, 'effect'::text, 'title'::text, 'name_color'::text, 'profile_theme'::text]));

-- Add new equipped columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_name_color text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_profile_theme text;

-- Delete all existing battle_pass_tiers and replace with 50 levels
DELETE FROM public.battle_pass_tiers;

INSERT INTO public.battle_pass_tiers (level, xp_required, reward_type, reward_name, reward_icon, reward_description, is_premium) VALUES
(1, 0, 'title', 'Newcomer', '🌱', 'Your first title - welcome to VYBE!', false),
(2, 100, 'name_color', 'Crimson', '🔴', 'A bold red for your display name', false),
(3, 250, 'cosmetic', 'Silver Ring', '⭕', 'A clean silver ring around your avatar', false),
(4, 450, 'effect', 'Sparkle', '✨', 'Subtle sparkle animation on your name', false),
(5, 700, 'title', 'Rising Star', '⭐', 'You are on the rise!', false),
(6, 1000, 'name_color', 'Ocean Blue', '🔵', 'Deep ocean blue for your name', false),
(7, 1300, 'profile_theme', 'Midnight', '🌙', 'Dark midnight gradient on your profile', false),
(8, 1600, 'cosmetic', 'Blue Glow', '💙', 'Soft blue glow around your avatar', false),
(9, 1800, 'effect', 'Rainbow Shift', '🌈', 'Your name shifts through rainbow hues', false),
(10, 2000, 'title', 'Trailblazer', '🔥', 'A true pioneer of the platform', false),
(11, 2300, 'name_color', 'Emerald', '💚', 'Rich emerald green for your name', false),
(12, 2600, 'cosmetic', 'Purple Aura', '💜', 'Mystic purple aura around your avatar', false),
(13, 3000, 'effect', 'Fire Trail', '🔥', 'Fiery glow effect on your name', false),
(14, 3400, 'profile_theme', 'Sunset Vibes', '🌅', 'Warm sunset gradient on your profile', false),
(15, 3800, 'title', 'Veteran', '🎖️', 'A seasoned member of the community', false),
(16, 4200, 'name_color', 'Sunset Orange', '🟠', 'Warm sunset orange for your name', false),
(17, 4600, 'cosmetic', 'Gold Frame', '🥇', 'Prestigious gold frame around your avatar', false),
(18, 5000, 'effect', 'Cosmic Glow', '🌌', 'Ethereal cosmic glow on your name', false),
(19, 5400, 'name_color', 'Neon Pink', '💖', 'Electric neon pink for your name', false),
(20, 6000, 'title', 'Icon', '👑', 'You have become an icon', false),
(21, 6600, 'profile_theme', 'Arctic', '❄️', 'Cool icy blue gradient on your profile', false),
(22, 7200, 'name_color', 'Ice Blue', '🧊', 'Frosty ice blue for your name', false),
(23, 7800, 'cosmetic', 'Neon Ring', '💿', 'Vibrant neon ring around your avatar', false),
(24, 8400, 'effect', 'Glitch', '👾', 'Digital glitch animation on your name', false),
(25, 9000, 'title', 'Elite', '💎', 'Among the elite few', false),
(26, 9600, 'name_color', 'Royal Purple', '👾', 'Regal purple for your name', false),
(27, 10200, 'profile_theme', 'Neon City', '🌃', 'Cyberpunk neon city gradient', false),
(28, 10800, 'cosmetic', 'Emerald Ring', '💚', 'Lush emerald ring around your avatar', false),
(29, 11400, 'effect', 'Neon Pulse', '💡', 'Pulsing neon glow on your name', false),
(30, 12000, 'title', 'Legend', '🏆', 'A living legend', false),
(31, 13000, 'name_color', 'Toxic Green', '☢️', 'Radioactive green for your name', false),
(32, 14000, 'profile_theme', 'Inferno', '🔥', 'Intense fire gradient on your profile', false),
(33, 15000, 'cosmetic', 'Sunset Halo', '🌅', 'Warm sunset halo around your avatar', false),
(34, 16000, 'effect', 'Shadow Flicker', '🖤', 'Dark flickering shadow on your name', false),
(35, 17000, 'title', 'Mythic', '⚡', 'Ascended to mythic status', false),
(36, 18000, 'name_color', 'Gold', '🥇', 'Luxurious gold for your name', false),
(37, 19000, 'cosmetic', 'Lightning Frame', '⚡', 'Electric lightning frame around your avatar', false),
(38, 20000, 'effect', 'Aurora Wave', '🌊', 'Northern lights wave on your name', false),
(39, 21000, 'profile_theme', 'Galaxy', '🌌', 'Deep space galaxy gradient', false),
(40, 22000, 'title', 'Immortal', '♾️', 'Beyond mortal limits', false),
(41, 24000, 'name_color', 'Diamond White', '💎', 'Pristine diamond white for your name', false),
(42, 26000, 'cosmetic', 'Obsidian Frame', '🖤', 'Dark obsidian frame with subtle glow', false),
(43, 28000, 'effect', 'Electric Surge', '⚡', 'Crackling electric surge on your name', false),
(44, 30000, 'profile_theme', 'Aurora Borealis', '🌌', 'Northern lights dancing on your profile', false),
(45, 32000, 'title', 'Celestial', '🌟', 'Among the stars', false),
(46, 34000, 'name_color', 'Holographic', '🌈', 'Shifting holographic colors for your name', false),
(47, 36000, 'cosmetic', 'Holographic Frame', '🌈', 'Iridescent holographic frame', false),
(48, 38000, 'effect', 'Plasma Storm', '🌀', 'Swirling plasma storm on your name', false),
(49, 39000, 'profile_theme', 'Void', '🕳️', 'Deep void darkness with accent highlights', false),
(50, 40000, 'title', 'VYBE God', '👑', 'The ultimate title - you ARE VYBE', false);
