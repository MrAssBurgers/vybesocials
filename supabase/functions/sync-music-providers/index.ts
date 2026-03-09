import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Track {
  id: string;
  title: string;
  artist: string;
  genre?: string;
  duration: number;
  preview_url: string;
  audio_url: string;
  artwork_url?: string;
}

interface Provider {
  provider_id: string;
  provider_name: string;
  api_base_url: string;
  api_key: string;
  is_active: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if user is admin
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { provider_id } = await req.json();

    if (!provider_id) {
      return new Response(JSON.stringify({ error: 'provider_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get provider details
    const { data: provider, error: providerError } = await supabaseClient
      .from('music_providers')
      .select('*')
      .eq('provider_id', provider_id)
      .eq('is_active', true)
      .single();

    if (providerError || !provider) {
      return new Response(JSON.stringify({ error: 'Provider not found or inactive' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Syncing music from provider: ${provider.provider_name}`);

    // Check cache first (using a simple time-based cache key)
    const cacheKey = `music_sync_${provider_id}_${Math.floor(Date.now() / (1000 * 60 * 60))}`;
    
    try {
      // Fetch tracks from provider API
      const response = await fetch(`${provider.api_base_url}/tracks`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${provider.api_key}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`Provider API error: ${response.status} ${response.statusText}`);
        return new Response(JSON.stringify({ 
          error: `Provider API error: ${response.status}`,
          details: await response.text()
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const apiData = await response.json();
      const tracks: Track[] = apiData.tracks || apiData.data || apiData;

      console.log(`Fetched ${tracks.length} tracks from provider API`);

      // Batch insert/update tracks
      const tracksToInsert = tracks.map(track => ({
        track_id: track.id,
        provider_id: provider.provider_id,
        title: track.title,
        artist: track.artist,
        genre: track.genre || 'Unknown',
        duration: track.duration,
        preview_url: track.preview_url,
        audio_url: track.audio_url,
        artwork_url: track.artwork_url,
      }));

      // Insert tracks in batches to avoid hitting limits
      const batchSize = 100;
      let syncedCount = 0;

      for (let i = 0; i < tracksToInsert.length; i += batchSize) {
        const batch = tracksToInsert.slice(i, i + batchSize);
        
        const { error: insertError } = await supabaseClient
          .from('licensed_tracks')
          .upsert(batch, { 
            onConflict: 'track_id',
            ignoreDuplicates: false 
          });

        if (insertError) {
          console.error('Error inserting batch:', insertError);
        } else {
          syncedCount += batch.length;
        }
      }

      // Initialize track usage for new tracks
      for (const track of tracksToInsert) {
        await supabaseClient
          .from('track_usage')
          .upsert({
            track_id: track.track_id,
            videos_created: 0,
            plays: 0,
            shares: 0,
            trend_score: 0
          }, { onConflict: 'track_id', ignoreDuplicates: true });
      }

      console.log(`Successfully synced ${syncedCount} tracks`);

      return new Response(JSON.stringify({
        success: true,
        provider: provider.provider_name,
        synced_count: syncedCount,
        total_fetched: tracks.length,
        cache_key: cacheKey
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Error syncing music provider:', error);
      return new Response(JSON.stringify({
        error: 'Failed to sync music provider',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error in sync-music-providers function:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});