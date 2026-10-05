# Interactive map fallback

The original Mapbox world map is the primary renderer in production and the isolated local preview. A fresh preference defaults to 3D: Mapbox Standard, globe projection, 52-degree pitch, and the existing terrain exaggeration. Explicitly stored map modes are preserved. Provider or WebGL failures never silently change the selected style: retry is available after a failure or 20-second startup timeout, with an explicit optional flat-map choice.

The preview CSP allows only Mapbox's documented styles/fonts/models under the `mapbox` account, tile/DEM/raster resources, GL wasm resources, and map-session/telemetry endpoints. Bundled workers use blob URLs. Firebase and other live API restrictions remain in place; preview place-search and directions requests remain unavailable. No automatic GPS permission prompt is introduced. See [Mapbox CSP guidance](https://docs.mapbox.com/mapbox-gl-js/guides/security-and-testing/).

If the user deliberately chooses the flat fallback, Leaflet uses standard OpenStreetMap tiles at `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. The preview CSP permits images from that exact host.

This is a best-effort interactive fallback, not a launch availability commitment. OpenStreetMap's community tile service has no SLA and can restrict access. A production fallback that needs guaranteed capacity requires an appropriately provisioned provider. See the [official tile policy](https://operations.osmfoundation.org/policies/tiles/).

The fallback requests visible tiles only, with no retained tile buffer, no zoom-animation fetching, no retina multiplier, no background prefetch, and no offline tile packs. Native browser HTTP caching is preserved. Tile images send the browser user agent and an origin referrer through `strict-origin-when-cross-origin`; no proxy, cache-busting parameter, or no-cache header is added. Do not add automated pan/zoom crawls or offline downloads to this endpoint.

The linked OpenStreetMap attribution sits immediately above the movable friends sheet, outside its collapsed content. It remains visible with the sheet open or closed. Tile failure has an explicit retry control. A successful tile response does not certify image contents or provider availability.

Opening the map does not request undecided GPS permission. The existing location action requests it; already granted watchers continue. Location reads use viewer-addressed shares and exact granted documents, refresh every 12 seconds and on share changes, and hide data on failure or account changes. This client repair does not replace the separate work needed to enforce share pause/expiry and strict identities throughout the legacy location backend.
