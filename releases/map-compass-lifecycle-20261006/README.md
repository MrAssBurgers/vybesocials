# 3D map compass lifecycle repair

The map previously scheduled another compass animation frame before checking whether it had a heading, whether rotation had settled or whether the app was backgrounded. Sensor listeners also outlived delayed permission replies, and a failed initial browser permission attempt remained cached forever.

Compass frames now wake on current sensor input, stop when interpolation settles, and resume after a real rotate gesture or recenter. Background/hidden transitions synchronously detach sensors, cancel scheduled compass work and discard its target; foreground recovery waits for a fresh sample. Queued work from a disposed map cannot rotate its replacement. Shared iOS gyro subscriptions still start once and stop only when the last subscriber leaves, and retired native callbacks cannot feed a new subscription. Delayed web permission results cannot reattach a departed subscription. Permission requests coalesce; failed requests may retry and missing orientation support returns unavailable safely.

The original globe, terrain, styles, Android smoothing coefficient, iOS gyro path, GPS follow behavior and sharing authority remain intact. No Firebase resources, records, authentication settings or permission grants were changed.

Verification: three map regressions and three sensor regressions fail against the prior source; 20 focused cases now pass. Full suite: 4,663 passed, six skipped. Types, build, native manifest validation and unchanged bundle budget pass; lint has five existing warnings. In an isolated actual Mapbox renderer, synthetic native pause held rotation count/bearing at 1/19.80 degrees despite simulated south input; resume alone stayed at 1/19.80; a fresh sample resumed smoothing to 28/179.80. Screenshot `outputs/vybe-compass-browser-check.png` in the parent workspace shows the actual 3D globe. Style changes were also exercised. No production account, real GPS or sensor permission was used. This proves compass lifecycle behavior, not physical-phone frame rate or location sharing.

Device orientation permission requires transient user activation; checked against [MDN's API documentation](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static). This repair retains the existing user interaction flow.

Publication evidence follows after the tested main commit is released.
