# Mobile reconnect recovery — 2026-10-06

Client bdde9a0601d78848c3239a710dec3fbc6b829d74 adds active-clip media recovery and bounded location transport waits. Only the active foreground clip retries a network media error on reconnect/foreground return. A manual Retry clip handles other playback errors. Departed/backgrounded/user-paused clips remain stopped. Existing autoplay and account/view guards remain in effect.

Location reads stop waiting at15seconds, mutations at20seconds. This retires local results, not remote writes; existing request identities remain for uncertain mutation retries. Current checked leases/permissions still govern map display, including expiry even while a refresh hangs.

Full474files4515tests pass6skip; app/native build, typecheck and lint (5 existing warnings) pass. Entry budget1100.3KBraw334.1KBgzip is under1125/335limits. Source identity5cca732e454d7ac1896fbc3ffc123d3a8ffebc23a238e6e4022265511367138d/2538inputs. Logs in work/mobile-reconnect-*.log. No new preloads, polling or per-frame work.

Named hosting deployment06fcc29f-5896-43e1-a9ea-18ac68106f54 requested after exact GitSync confirmation. Completion confirmed by actual website-updated dialog; both origins match every source identity field and fetched entry SHAeee6c9f2bffc75d4f90f6ca3b1f705a9c910f35f7be1a24746d66c71fd205676 (CnVHL7T8, built06:50:24Z). Mounted and native adoption remain separate. No Firebase backend, Rules, Storage, Auth settings, secrets, account consent or production data changes.

Retained desktop Clips plays one current video with readyState4/errornull, but mounts old CGCcULTp; live Mapbox loads but friend-location read fails. Neither proves actual mobile functionality. Phone runtime clarification, actual GPS/codec/native OTA adoption and broader restoration/security readiness remain open. Unfinished checked-discovery source preserved as work candidates, excluded from this release.