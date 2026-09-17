# OK2Ride

OK2Ride is a standalone W3C web component, `<ok2ride-check>`, that runs a short cognitive capability check
before a micromobility vehicle (e-scooter, e-bike) is unlocked. Every run
draws a random set of tests from a pool of eight (reaction, steering, go/no-go,
number trail, pattern memory, colour match, time sense, odd one out) and
reports the outcome through DOM events.

- Zero runtime dependencies; one ES module (`dist/ok2ride.js`).
- Checks that the input came from a person, not a script (see [Humanity check](#humanity-check)).
- Shadow DOM: styles and markup are fully encapsulated.
- Deterministic finite state machine with millisecond timing via `performance.now()`.
- Mobile-first, high-contrast UI for outdoor daylight and night-time use.

## Usage

```html
<script type="module" src="/dist/ok2ride.js"></script>

<ok2ride-check
  stage-count="2"
  difficulty="medium"
  time-limit-ms="90000"
  theme="dark"
  challenge-nonce="server-issued-nonce"
></ok2ride-check>

<script type="module">
  const captcha = document.querySelector('ok2ride-check');
  captcha.addEventListener('capability-passed', (e) => unlockVehicle(e.detail.verificationToken));
  captcha.addEventListener('capability-failed', (e) => console.warn(e.detail.failureReason));
</script>
```

With a bundler, install it from npm:

```sh
npm install ok2ride
```

`import 'ok2ride'` then registers the element and exposes the engine types:

```ts
import 'ok2ride';
import type { AssessmentResult } from 'ok2ride';
```

### Attributes / properties

| Attribute         | Property         | Type                              | Default    | Notes                                                        |
| ----------------- | ---------------- | --------------------------------- | ---------- | ------------------------------------------------------------ |
| `stage-count`     | `stageCount`     | `number` (1–8)                    | `2`        | Tests drawn per run, in random order.                        |
| `stage-pool`      | `stagePool`      | comma-separated test ids          | all eight  | Restricts which tests may be drawn (e.g. `pvt,stroop`).      |
| `difficulty`      | `difficulty`     | `'easy' \| 'medium' \| 'hard'`    | `'medium'` | Tunes tolerances, windows and error allowances (see below).  |
| `max-lapses`      | `maxLapses`      | `number` (0–20)                   | `2`        | PVT only: fails once `lapseCount > maxLapses`.               |
| `time-limit-ms`   | `timeLimitMs`    | `number` (5 000–600 000)          | `90000`    | Overall budget from the instruction acknowledgement.         |
| `theme`           | `theme`          | `'dark' \| 'light'`               | `'dark'`   | Applied instantly.                                           |
| `lang`            | `lang`           | BCP-47 tag (`en`, `de`)           | inherited  | UI language. Falls back to the document's `lang`, then English. Applies instantly, even mid-run. |
| `human-check`     | `humanCheck`     | `'strict' \| 'lenient' \| 'off'`   | `'strict'` | How scripted or bot-like input is treated. See [Humanity check](#humanity-check).   |
| `challenge-nonce` | `challengeNonce` | `string`                          | none       | Echoed in the result and bound into the verification token.  |

Configuration is frozen while a run is in progress; new values apply on the
next `reset()`.

Read-only properties: `stage` (current FSM stage), `plan` (tests drawn), `config`, `result`,
`active`, `humanity` (the humanity report so far, live during a run).
Methods: `start()`, `reset()`.

### Events

All events bubble and are `composed`.

| Event               | `detail`                                        |
| ------------------- | ----------------------------------------------- |
| `capability-passed` | `AssessmentResult`                              |
| `capability-failed` | `AssessmentResult` (see `failureReason`)        |
| `stage-change`      | `{ stage: TestStage; previous: TestStage }`     |

`AssessmentResult` includes the `plan`, a per-test `results` array (one
typed entry per test that ran), `failedTest`, `completionTimeMs`, `meanRtMs`
across every reaction recorded, the PVT `trials`, the `SpatialResult`, the
`humanity` report, and `verificationToken`.

## Tests

Each run draws `stage-count` distinct tests from the pool, shuffles them, and
presents them one after another with a short intro screen before each. The
run fails at the first failed test.

| id          | Name           | What it measures              | Pass rule (medium)                                   |
| ----------- | -------------- | ----------------------------- | ---------------------------------------------------- |
| `pvt`       | Reaction       | Vigilance, alertness          | 3 consecutive valid taps; ≤ `max-lapses` lapses       |
| `spatial`   | Steering       | Motor control, spatial sense  | Handlebar released within ±5° inside 3 s              |
| `go-no-go`  | Go / Stop      | Impulse control               | 6 signals (2 STOP); ≤ 1 false tap, ≤ 1 missed GO      |
| `trail`     | Number trail   | Visual scanning, sequencing   | Tap 1–8 in order within 12 s; ≤ 2 wrong taps          |
| `sequence`  | Pattern memory | Working memory                | Repeat a 4-tile pattern exactly within 8 s            |
| `stroop`    | Colour match   | Interference control          | 5 rounds; ≤ 1 wrong or unanswered                     |
| `timing`    | Time sense     | Interval timing               | 2 rounds; ≤ 1 judged outside ±0.5 s                   |
| `search`    | Odd one out    | Visual search, scanning       | 3 rounds; ≤ 1 wrong or unfound symbol                 |

**Reaction (PVT-B).** After a random foreperiod of 1 500–4 500 ms the panel
flashes; the rider taps as fast as possible. < 100 ms is a false start
(trial invalidated), 100–450 ms is valid, > 450 ms or no tap within 2 s is a
lapse. Any invalid trial resets the streak. These thresholds never change.

**Difficulty** adjusts the other tests:

| Difficulty | Steering       | Go/Stop false taps | Trail             | Pattern length | Colour errors | Time sense        | Odd one out     |
| ---------- | -------------- | ------------------ | ----------------- | -------------- | ------------- | ----------------- | --------------- |
| easy       | ±8°, 4.0 s     | ≤ 1                | 6 numbers, 15 s, ≤ 3 errors | 3     | ≤ 2           | ±0.7 s, ≤ 1 miss  | 9 symbols, ≤ 2  |
| medium     | ±5°, 3.0 s     | ≤ 1                | 8 numbers, 12 s, ≤ 2 errors | 4     | ≤ 1           | ±0.5 s, ≤ 1 miss  | 12 symbols, ≤ 1 |
| hard       | ±3°, 2.5 s     | 0                  | 10 numbers, 11 s, ≤ 1 error | 5     | 0             | ±0.35 s, 0 misses | 16 symbols, 0   |

Every parameter is exposed on `AssessmentConfig` for hosts that replay or
audit runs.

## Humanity check

Every input the widget acts on is also evidence about who produced it. The
check runs alongside the tests and reports a `HumanityReport` on the result:

```js
captcha.addEventListener('capability-failed', (e) => {
  if (e.detail.failureReason === 'HUMAN_CHECK_FAILED') {
    console.warn(e.detail.humanity.signals); // why it was rejected
  }
});
```

```ts
interface HumanityReport {
  verdict: 'human' | 'suspect' | 'automated';
  score: number;                  // 1 = nothing suggests automation, 0 = conclusively automated
  signals: HumanitySignal[];      // evidence found, strongest first
  sampleCount: number;
  latencyCv: number | null;       // spread of the response latencies
}
```

Evidence comes in two kinds.

**Decisive.** `Event.isTrusted` is false for every event a script dispatched.
The DOM specification guarantees it and page code cannot forge it, so one such
event ends the run immediately with `failureReason: 'HUMAN_CHECK_FAILED'`.

**Behavioural.** Each of these is only suggestive, so each carries a weight and
none can fail a run on its own — two independent ones have to agree.

| Signal               | Weight | Fires when                                                              |
| -------------------- | ------ | ----------------------------------------------------------------------- |
| `synthetic-event`    | 1.00   | An input event carried `isTrusted === false`. Decisive.                  |
| `uniform-timing`     | 0.60   | ≥ 6 response latencies varying by less than 2 % — no hand is that steady. |
| `fixed-pointer`      | 0.60   | ≥ 4 touch taps on different stages from one exact pixel.                 |
| `automation-flag`    | 0.50   | The browser reports `navigator.webdriver`.                              |
| `superhuman-latency` | 0.50   | More than one response under 60 ms, which beats nerve conduction.        |
| `still-pointer`      | 0.35   | ≥ 3 mouse taps without the pointer ever moving.                          |

The weights are summed: from 0.3 the verdict is `suspect`, from 0.8 it is
`automated`. Only touch and pen coordinates are judged, because a mouse
resting on a button repeats its coordinates exactly as a script would.

| `human-check` | Ends the run on                                | Reports |
| ------------- | ---------------------------------------------- | ------- |
| `strict`      | scripted input, or an `automated` verdict       | always  |
| `lenient`     | scripted input only                             | always  |
| `off`         | nothing; no evidence is collected               | `null`  |

The verdict and score are bound into the verification token (`hv`, `hs`), so a
backend can weigh them even when the run was allowed to finish.

**What this is and is not.** It runs in the browser it is judging, so it is
evidence, not proof. It reliably rejects the cheap attack — dispatching events
at the element — and makes the expensive one harder, but a driver-based bot
that imitates human jitter will pass. Thresholds are set well outside what a
hand can produce, so genuine riders are rarely accused; the price is that a
careful bot is missed. Treat the report as one input to a server-side
decision, next to the nonce, rate limits and your own fraud signals.

**Automated tests.** An end-to-end suite is automation, and strict mode is
meant to reject it. Run the widget with `human-check="lenient"` in CI (scripted
input is still rejected, behaviour is only reported) or `"off"` to switch the
check off entirely.

## Verification token

`verificationToken` has the form `ok2r1.<base64url claims>.<fnv1a-64 checksum>`.
The claims are at version `2`, which added `hv` (humanity verdict) and `hs`
(humanity score); tokens from 0.1.x no longer decode.
`decodeVerificationToken()` (exported) parses and checksum-validates it. The
token is generated client-side, so it is tamper-evident but **not
unforgeable**. A backend must validate the decoded claims (session id, nonce,
outcome, timestamp) against its own records before unlocking a vehicle.

## Architecture

```
src/
  types.ts                     Discriminated unions for TestStage / Action, config, per-test results
  config.ts                    Defaults, difficulty presets, attribute validation
  stateMachine.ts              Run lifecycle reducer, plan selection, scoring, timerEffectFor()
  tasks/                       One module per test: start / reduce / timerEffect (pure, no DOM)
  humanity.ts                  Scores the input evidence (pure, no DOM)
  token.ts                     Token encode / decode
  components/OK2Ride.ts  Custom element: attributes, shadow DOM, timers, events
  components/input.ts          Collects input evidence from the shadow root
  components/screens/          One renderer per screen (build once, patch on every state change)
  components/styles.ts         Encapsulated CSS string
  index.ts                     Public exports + auto-registration
examples/bike-rental/          Example rental app (browser app + API server), see its README
site/
  index.html, main.ts          Landing page with the live widget and event log
  docs.html, docs.ts           Documentation
  assets/site.css              Site styles (independent of the widget's shadow styles)
```

`reduce(state, action, env)` is deterministic: time and randomness are injected
through `env`, which makes every transition (including plan selection)
unit-testable. Each task module owns its stage types and returns either a new
stage or a finished `TestResult`; the core decides whether to introduce the
next test or evaluate the run. The element arms a single timer per stage from
`timerEffectFor()` and reveals flash stimuli inside `requestAnimationFrame` so
onset time is sampled right before the paint.

Adding a test means one module in `tasks/`, one screen in
`components/screens/`, and a new `TestId`.

## Website & documentation

The `site/` directory holds the project website: a landing page with the live
widget and the full documentation (installation, configuration, events and
result payload, the eight tests, run flow and timing, server verification,
theming, accessibility, engine API). It is a static Vite multi-page build with
a relative base, so the output can be hosted from any path.

```sh
npm run dev           # website with the live widget at http://localhost:5173
npm run site:build    # static output in dist-site/
npm run site:preview  # serve dist-site/
```

## Example: bike rental app

`examples/bike-rental/` is a small rental web app, OK2Ride Bikes, with its own
API server. Every unlock goes through the widget: the server issues a
one-time nonce, the widget runs with it, and the rental starts only after the
server has verified the token. Failed checks start a short cooldown.

```sh
npm run rent       # http://localhost:5174
```

See `examples/bike-rental/README.md` for the flow, the server rules and the API.

## Server-side token helpers

`ok2ride/token` is a DOM-free entry (`dist/token.js`) for backends:

```js
import { decodeVerificationToken } from 'ok2ride/token';
const claims = decodeVerificationToken(token); // null when malformed or tampered
```

## Development

```sh
npm install
npm run dev        # website + live widget at http://localhost:5173
npm run typecheck
npm test
npm run rent       # example bike-rental app + API at http://localhost:5174
npm run build      # dist/ok2ride.js, dist/token.js, dist/types/
npm run check      # typecheck + tests + library, site and example builds
```

The element extends `HTMLElement`, so import the module from browser code only.
