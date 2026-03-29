
-- 1. Raise validation cap from 50 to 100
CREATE OR REPLACE FUNCTION public.validate_battle_pass_tier()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.level > 1 AND (NEW.xp_required IS NULL OR NEW.xp_required <= 0) THEN
    RAISE EXCEPTION 'battle_pass_tiers: level % must have xp_required > 0 (got %)', NEW.level, NEW.xp_required;
  END IF;
  IF NEW.level > 100 THEN
    RAISE EXCEPTION 'battle_pass_tiers: level % exceeds maximum of 100', NEW.level;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Raise level calc cap
CREATE OR REPLACE FUNCTION public.calculate_level_from_xp(p_xp integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_level INTEGER;
BEGIN
  SELECT COALESCE(MAX(level), 1) INTO v_level
  FROM public.battle_pass_tiers
  WHERE xp_required <= p_xp
    AND (level = 1 OR xp_required > 0)
    AND level <= 100;
  IF v_level IS NULL OR v_level < 1 THEN
    v_level := 1;
  END IF;
  RETURN LEAST(v_level, 100);
END;
$$;

-- 3. Insert levels 51-100
INSERT INTO public.battle_pass_tiers (level, reward_name, reward_type, reward_icon, xp_required, is_premium, reward_description) VALUES
(51, 'Phantom', 'title', '👻', 32000, false, 'A ghost among legends'),
(52, 'Phantom Silver', 'name_color', '🪽', 34000, false, 'Ethereal silver name glow'),
(53, 'Void Theme', 'profile_theme', '🕳️', 36000, false, 'Deep void darkness profile'),
(54, 'Ghost Ring', 'cosmetic', '💀', 38000, false, 'Spectral ring around avatar'),
(55, 'Phase Shift', 'effect', '🌀', 40000, false, 'Dimensional shift animation'),
(56, 'Celestial White', 'name_color', '🤍', 42500, false, 'Pure celestial name color'),
(57, 'Nebula', 'profile_theme', '🌌', 45000, false, 'Deep space nebula theme'),
(58, 'Star Crown', 'cosmetic', '👑', 47500, false, 'Crown of stars cosmetic'),
(59, 'Warp Speed', 'effect', '🚀', 50000, false, 'Warp speed entrance effect'),
(60, 'Ascended', 'title', '🏛️', 52500, false, 'Beyond mortal ranks'),
(61, 'Plasma Blue', 'name_color', '🔷', 55000, false, 'Electric plasma name glow'),
(62, 'Cyber Grid', 'profile_theme', '🔲', 57500, false, 'Cyberpunk grid theme'),
(63, 'Hologram Frame', 'cosmetic', '🪞', 60000, false, 'Holographic avatar frame'),
(64, 'Data Stream', 'effect', '📡', 62500, false, 'Digital data stream trail'),
(65, 'Overlord', 'title', '⚔️', 65000, false, 'Supreme commander title'),
(66, 'Neon Lime', 'name_color', '💚', 67500, false, 'Vivid neon lime name'),
(67, 'Aurora Borealis', 'profile_theme', '🌈', 70000, false, 'Northern lights theme'),
(68, 'Diamond Crown', 'cosmetic', '💎', 73000, false, 'Diamond-encrusted crown'),
(69, 'Lightning Storm', 'effect', '⛈️', 76000, false, 'Crackling lightning effect'),
(70, 'Immortal', 'title', '♾️', 79000, false, 'Eternal presence title'),
(71, 'Molten Gold', 'name_color', '🟡', 82000, false, 'Liquid gold name shimmer'),
(72, 'Volcanic', 'profile_theme', '🌋', 85000, false, 'Molten lava theme'),
(73, 'Obsidian Shield', 'cosmetic', '🛡️', 88000, false, 'Dark obsidian shield frame'),
(74, 'Earthquake', 'effect', '💥', 91000, false, 'Ground-shaking entrance'),
(75, 'Titan', 'title', '🗿', 95000, false, 'Colossal titan status'),
(76, 'Blood Red', 'name_color', '❤️‍🔥', 99000, false, 'Deep crimson name fire'),
(77, 'Dragon Scale', 'profile_theme', '🐉', 103000, false, 'Scaled dragon theme'),
(78, 'Wings of Fire', 'cosmetic', '🔥', 107000, false, 'Flaming wing cosmetic'),
(79, 'Supernova', 'effect', '💫', 111000, false, 'Exploding star effect'),
(80, 'Demigod', 'title', '⚡', 115000, false, 'Half divine status'),
(81, 'Arctic Frost', 'name_color', '🧊', 120000, false, 'Frozen ice name effect'),
(82, 'Crystal Cave', 'profile_theme', '💠', 125000, false, 'Crystalline cave theme'),
(83, 'Prism Halo', 'cosmetic', '🌈', 130000, false, 'Rainbow prism halo'),
(84, 'Time Warp', 'effect', '⏳', 135000, false, 'Time distortion effect'),
(85, 'Sovereign', 'title', '🏰', 140000, false, 'Royal sovereign status'),
(86, 'Eclipse Black', 'name_color', '🌑', 146000, false, 'Total eclipse name'),
(87, 'Deep Ocean', 'profile_theme', '🐋', 152000, false, 'Abyssal ocean depths theme'),
(88, 'Trident Frame', 'cosmetic', '🔱', 158000, false, 'Poseidon trident frame'),
(89, 'Tidal Wave', 'effect', '🌊', 164000, false, 'Massive wave entrance'),
(90, 'Eternal', 'title', '🌟', 170000, false, 'Forever remembered'),
(91, 'Stardust Pink', 'name_color', '🩷', 177000, false, 'Cosmic pink stardust'),
(92, 'Galaxy Core', 'profile_theme', '🪐', 184000, false, 'Galactic center theme'),
(93, 'Infinity Ring', 'cosmetic', '♾️', 191000, false, 'Infinite loop frame'),
(94, 'Black Hole', 'effect', '🕳️', 198000, false, 'Gravitational pull effect'),
(95, 'Apex', 'title', '🦅', 205000, false, 'Peak of all peaks'),
(96, 'Solar Flare', 'name_color', '☀️', 215000, false, 'Blazing solar name'),
(97, 'Quantum', 'profile_theme', '⚛️', 225000, false, 'Quantum realm theme'),
(98, 'Omega Crown', 'cosmetic', '🏆', 235000, false, 'Ultimate crown cosmetic'),
(99, 'Reality Bend', 'effect', '🔮', 245000, false, 'Reality-warping effect'),
(100, 'VYBE God', 'title', '👁️', 260000, false, 'The ultimate VYBE status')
ON CONFLICT DO NOTHING;
