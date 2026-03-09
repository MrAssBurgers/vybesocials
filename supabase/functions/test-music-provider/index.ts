import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Detect if this is a Pixabay provider
function isPixabayProvider(apiBaseUrl: string): boolean {
  return apiBaseUrl.includes('pixabay.com');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { api_base_url, api_key } = await req.json();

    if (!api_base_url || !api_key) {
      return new Response(JSON.stringify({ 
        error: 'api_base_url and api_key are required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Testing connection to: ${api_base_url}`);

    let testResponse: Response;
    let tracks: unknown[] = [];

    // Handle Pixabay differently - uses query param auth
    if (isPixabayProvider(api_base_url)) {
      const pixabayUrl = `${api_base_url}?key=${api_key}&per_page=5`;
      console.log('Testing Pixabay API...');
      
      testResponse = await fetch(pixabayUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000)
      });

      const responseText = await testResponse.text();
      
      if (!testResponse.ok) {
        console.error(`Pixabay test failed: ${testResponse.status} ${testResponse.statusText}`);
        return new Response(JSON.stringify({
          success: false,
          error: `Pixabay API test failed: ${testResponse.status} ${testResponse.statusText}`,
          details: responseText,
          status_code: testResponse.status
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let testData;
      try {
        testData = JSON.parse(responseText);
      } catch (parseError) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid JSON response from Pixabay API',
          details: responseText.substring(0, 500)
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Pixabay returns { total, totalHits, hits: [...] }
      tracks = testData.hits || [];
      
      if (tracks.length > 0) {
        const sampleTrack = tracks[0] as Record<string, unknown>;
        console.log(`Pixabay test successful. Found ${testData.totalHits} total tracks.`);
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Pixabay connection successful',
          tracks_found: testData.totalHits || tracks.length,
          sample_track: {
            id: `pixabay_${sampleTrack.id}`,
            title: sampleTrack.tags?.toString().split(',')[0]?.trim() || `Track ${sampleTrack.id}`,
            artist: sampleTrack.user || 'Unknown',
            duration: sampleTrack.duration
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Pixabay connection successful but no tracks found',
        tracks_found: 0,
        sample_track: null
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else {
      // Standard provider API (Bearer token auth)
      testResponse = await fetch(`${api_base_url}/tracks?limit=1`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000)
      });

      const responseText = await testResponse.text();
      
      if (!testResponse.ok) {
        console.error(`Provider test failed: ${testResponse.status} ${testResponse.statusText}`);
        console.error('Response:', responseText);
        
        return new Response(JSON.stringify({
          success: false,
          error: `API test failed: ${testResponse.status} ${testResponse.statusText}`,
          details: responseText,
          status_code: testResponse.status
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let testData;
      try {
        testData = JSON.parse(responseText);
      } catch (parseError) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid JSON response from provider API',
          details: responseText.substring(0, 500)
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Validate that the response has the expected structure
      tracks = testData.tracks || testData.data || testData;
      if (!Array.isArray(tracks)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Provider API did not return tracks array',
          details: 'Expected "tracks", "data", or root array'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if we got at least one track and validate its structure
      if (tracks.length > 0) {
        const sampleTrack = tracks[0] as Record<string, unknown>;
        const requiredFields = ['id', 'title', 'artist', 'duration', 'preview_url', 'audio_url'];
        const missingFields = requiredFields.filter(field => !sampleTrack[field]);
        
        if (missingFields.length > 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Invalid track structure',
            details: `Missing required fields: ${missingFields.join(', ')}`,
            sample_track: sampleTrack
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      console.log(`Provider test successful. Found ${tracks.length} tracks.`);

      return new Response(JSON.stringify({
        success: true,
        message: 'Provider connection successful',
        tracks_found: tracks.length,
        sample_track: tracks.length > 0 ? {
          id: (tracks[0] as Record<string, unknown>).id,
          title: (tracks[0] as Record<string, unknown>).title,
          artist: (tracks[0] as Record<string, unknown>).artist,
          duration: (tracks[0] as Record<string, unknown>).duration
        } : null
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error testing music provider:', error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Connection timeout',
        details: 'The provider API did not respond within 10 seconds'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'Connection failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
