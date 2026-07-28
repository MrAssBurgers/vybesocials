# Native Permission & Offline Matrix (R-03)

Use this checklist on physical **iOS** and **Android** Despia builds against staging (`vybe-daaab.web.app`) or post–Lovable Publish (`vybehub.app`). Attach screen recordings + log refs before store certification.

## Accounts
- Primary: `codex.qa.20260728.0709@example.com`
- Peer: `codex.qa.peer.20260728.0715@example.com`

## Camera (`/upload` + Snap)
| Case | iOS | Android | Expected |
|---|---|---|---|
| Allow | | | Live preview; labeled shutter |
| Deny | | | Explicit permission UI + gallery fallback |
| Revoke mid-session | | | Recovery message; stream stops |
| Busy / in use | | | NotReadableError guidance |
| No device | | | NotFoundError guidance |
| Background during record | | | No crash; recoverable |

## Location (`/map` + background)
| Case | iOS | Android | Expected |
|---|---|---|---|
| Allow while using | | | Coordinates; truthful live status |
| Deny | | | Single toast; `Location off` / not sharing |
| Background allow/deny | | | Matches capability; no duplicate toasts |
| Ghost Mode + no coords | | | Still `Not sharing` / location off |

## Push
| Case | iOS | Android | Expected |
|---|---|---|---|
| Allow | | | Token registered |
| Deny | | | Soft prompt; app usable |
| Friend request while denied | | | In-app notification still works |

## Calls
| Case | iOS | Android | Expected |
|---|---|---|---|
| Mic/cam allow | | | Call connects |
| Mic deny | | | Clear error; hang up safe |
| Network drop mid-call | | | Reconnect or clean end |

## Offline / queue
| Case | iOS | Android | Expected |
|---|---|---|---|
| Airplane during post upload | | | Banner fail + Retry; draft retained |
| Restart with queued upload | | | Resume or explicit fail; no duplicate posts |
| Offline AI send | | | Reference + Retry; no quota burn |
| Offline DM send | | | Outbox / retry UI |

## Sign-off
- Tester:
- Build / SHA:
- Date:
- Blockers found:
