import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const primaryColor = url.searchParams.get('primary') || '271 91% 65%'; // Default purple
    const accentColor = url.searchParams.get('accent') || '189 94% 43%'; // Default cyan
    const size = parseInt(url.searchParams.get('size') || '512');

    // Same padding as favicon for consistent V shape
    const padding = size * 0.1;
    const strokeWidth = size * 0.14;
    
    // Calculate V positions matching the favicon exactly
    const topY = padding + strokeWidth / 2;
    const bottomY = size - padding - strokeWidth / 2;
    const leftX = padding + strokeWidth / 2;
    const rightX = size - padding - strokeWidth / 2;
    const centerX = size / 2;

    // Transparent SVG with V logo - matches favicon exactly
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="primary-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${primaryColor.replace(/\s+/g, ', ')})"/>
      <stop offset="50%" stop-color="hsl(${primaryColor.replace(/\s+/g, ', ')})"/>
      <stop offset="100%" stop-color="hsl(${primaryColor.replace(/\s+/g, ', ')})"/>
    </linearGradient>
    <linearGradient id="accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${accentColor.replace(/\s+/g, ', ')})"/>
      <stop offset="50%" stop-color="hsl(${accentColor.replace(/\s+/g, ', ')})"/>
      <stop offset="100%" stop-color="hsl(${accentColor.replace(/\s+/g, ', ')})"/>
    </linearGradient>
  </defs>
  <path d="M${leftX} ${topY} L${centerX} ${bottomY}" stroke="url(#primary-grad)" stroke-width="${strokeWidth}" stroke-linecap="round"/>
  <path d="M${rightX} ${topY} L${centerX} ${bottomY}" stroke="url(#accent-grad)" stroke-width="${strokeWidth}" stroke-linecap="round"/>
  <circle cx="${centerX}" cy="${bottomY}" r="${strokeWidth * 0.3}" fill="white"/>
</svg>`;

    return new Response(svg, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error generating icon:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
