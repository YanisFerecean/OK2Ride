# OK2Ride Bikes (example app)

A small bike-rental web app that puts the OK2Ride widget in front of every
unlock. Riders pick a city bike, e-bike or cargo bike on a map, take a short
randomised OK2Ride check, and the bike unlocks only after the server has
verified the result.

```sh
npm run rent            # http://localhost:5174, with the API
npm run rent:build      # static build in dist-rent/
npm run rent:preview    # serves dist-rent/ with the API on http://localhost:4174
```

## The unlock flow

1. The rider picks a bike and presses **Start safety check**.
2. The app asks the server for a challenge (`POST /api/challenges`). The
   server answers with a one-time nonce plus the check policy for that bike
   type: 2 tests for city bikes, 3 for e-bikes and cargo bikes.
3. The app mounts `<ok2ride-check>` with `challenge-nonce`, `stage-count` and
   `difficulty` from the challenge, and calls `start()` so the rider lands
   straight on the instructions.
4. On `capability-passed` the app sends the verification token with the bike
   id to `POST /api/rentals`. The server validates it and returns the rental
   with a keypad unlock code.
5. On `capability-failed` the app sends the token to `POST /api/checks/failed`.
   The server consumes the nonce and starts a 30-second cooldown, which the
   app shows as a countdown before **Try again** unlocks.
6. The ride screen shows elapsed time and the running cost. **End ride** asks
   for the return station and shows the receipt.

## What the server checks before unlocking

All of this lives in `server/store.ts`, next to its tests.

| Rule | Error code |
| --- | --- |
| Token decodes and its checksum matches | `TOKEN_INVALID` |
| The check passed | `CHECK_NOT_PASSED` |
| The nonce was issued by this server to this rider | `NONCE_UNKNOWN` |
| The nonce has not been used | `NONCE_USED` |
| The challenge is under 5 minutes old | `NONCE_EXPIRED` |
| The challenge was for this bike | `BIKE_MISMATCH` |
| The token was issued within the last 2 minutes | `TOKEN_STALE` |
| The check did not take longer than the time since the challenge | `IMPLAUSIBLE_TIMING` |
| The check ran at least the tests this bike type requires | `NOT_ENOUGH_TESTS` |
| The rider has no ride in progress, the bike is still free | `ALREADY_RIDING`, `BIKE_UNAVAILABLE` |

The token is generated in the browser, so these rules make replay and
casual tampering fail. They do not make a hostile client impossible. See the
OK2Ride documentation on server verification.

## API

| Method and path | Body | Answer |
| --- | --- | --- |
| `GET /api/fleet` | | Stations, bikes, prices, check policy per bike type |
| `GET /api/me` | | Rider, active ride, last five rides, cooldown, server time |
| `POST /api/challenges` | `{ bikeId }` | `201` challenge, or `429 COOLDOWN` with `retryAt` |
| `POST /api/checks/failed` | `{ token }` | `{ cooldownUntil }` |
| `POST /api/rentals` | `{ bikeId, token }` | `201` rental with `unlockCode` |
| `POST /api/rentals/:id/end` | `{ stationId }` | Finished rental with `minutes` and `costCents` |

Riders are identified by an HttpOnly, SameSite=Lax cookie created on first
visit. POST bodies must be JSON. Errors come back as
`{ "error": { "code", "message" } }`.

## Files

```
index.html            page shell
src/app.ts            views, overlays and the check flow
src/api.ts            fetch client and ApiError
src/map.ts            SVG station map
src/format.ts         money, time and label formatting
src/styles.css        mobile-first light and dark theme
server/store.ts       fleet, riders, challenges, rentals and the unlock rules
server/http.ts        JSON routes as a Connect-style middleware
server/plugin.ts      mounts the API on Vite's dev and preview servers
server/seed.ts        stations, bikes, prices, check policy
shared/               types and pricing used by both sides
```

## Limits

This is a demo. State is kept in memory and resets when the server restarts.
There are no accounts or payments; the rider cookie stands in for a login.
The map is a drawing of a fictional city.
