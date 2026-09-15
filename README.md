# `<cognitive-captcha>`

A standalone W3C web component that runs a short cognitive capability check
before a micromobility vehicle (e-scooter, e-bike) is unlocked. Every run
draws a random set of tests from a pool of six (reaction, steering, go/no-go,
number trail, pattern memory, colour match) and reports the outcome through
DOM events.

- Zero runtime dependencies; one ES module (`dist/cognitive-captcha.js`).
- Shadow DOM: styles and markup are fully encapsulated.
- Deterministic finite state machine with millisecond timing via `performance.now()`.
- Mobile-first, high-contrast UI for outdoor daylight and night-time use.

## Usage

```html
<script type="module" src="/dist/cognitive-captcha.js"></script>

<cognitive-captcha
  stage-count="2"
  difficulty="medium"
  time-limit-ms="90000"
  theme="dark"
  challenge-nonce="server-issued-nonce"
></cognitive-captcha>

<script type="module">
  const captcha = document.querySelector('cognitive-captcha');
  captcha.addEventListener('capability-passed', (e) => unlockVehicle(e.detail.verificationToken));
  captcha.addEventListener('capability-failed', (e) => console.warn(e.detail.failureReason));
</script>
```

With a bundler, `import 'cognitive-captcha'` registers the element and exposes
the engine types:

```ts
import 'cognitive-captcha';
import type { AssessmentResult } from 'cognitive-captcha';
```

### Attributes / properties

| Attribute         | Property         | Type                              | Default    | Notes                                                        |
| ----------------- | ---------------- | --------------------------------- | ---------- | ------------------------------------------------------------ |
| `stage-count`     | `stageCount`     | `number` (1–6)                    | `2`        | Tests drawn per run, in random order.                        |
| `stage-pool`      | `stagePool`      | comma-separated test ids          | all six    | Restricts which tests may be drawn (e.g. `pvt,stroop`).      |
| `difficulty`      | `difficulty`     | `'easy' \| 'medium' \| 'hard'`    | `'medium'` | Tunes tolerances, windows and error allowances (see below).  |
| `max-lapses`      | `maxLapses`      | `number` (0–20)                   | `2`        | PVT only: fails once `lapseCount > maxLapses`.               |
| `time-limit-ms`   | `timeLimitMs`    | `number` (5 000–600 000)          | `90000`    | Overall budget from the instruction acknowledgement.         |
| `theme`           | `theme`          | `'dark' \| 'light'`               | `'dark'`   | Applied instantly.                                           |
| `challenge-nonce` | `challengeNonce` | `string`                          | none       | Echoed in the result and bound into the verification token.  |

Configuration is frozen while a run is in progress; new values apply on the
next `reset()`.

Read-only properties: `stage` (current FSM stage), `plan` (tests drawn), `config`, `result`, `active`.
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
across every reaction recorded, the PVT `trials`, the `SpatialResult`, and
`verificationToken`.

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

**Reaction (PVT-B).** After a random foreperiod of 1 500–4 500 ms the panel
flashes; the rider taps as fast as possible. < 100 ms is a false start
(trial invalidated), 100–450 ms is valid, > 450 ms or no tap within 2 s is a
lapse. Any invalid trial resets the streak. These thresholds never change.

**Difficulty** adjusts the other tests:

| Difficulty | Steering       | Go/Stop false taps | Trail             | Pattern length | Colour errors |
| ---------- | -------------- | ------------------ | ----------------- | -------------- | ------------- |
| easy       | ±8°, 4.0 s     | ≤ 1                | 6 numbers, 15 s, ≤ 3 errors | 3     | ≤ 2           |
| medium     | ±5°, 3.0 s     | ≤ 1                | 8 numbers, 12 s, ≤ 2 errors | 4     | ≤ 1           |
| hard       | ±3°, 2.5 s     | 0                  | 10 numbers, 11 s, ≤ 1 error | 5     | 0             |

Every parameter is exposed on `AssessmentConfig` for hosts that replay or
audit runs.

## Verification token

`verificationToken` has the form `cc1.<base64url claims>.<fnv1a-64 checksum>`.
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
  token.ts                     Token encode / decode
  components/CognitiveCaptcha.ts  Custom element: attributes, shadow DOM, timers, events
  components/screens/          One renderer per screen (build once, patch on every state change)
  components/styles.ts         Encapsulated CSS string
  index.ts                     Public exports + auto-registration
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

## Development

```sh
npm install
npm run dev        # demo page at http://localhost:5173
npm run typecheck
npm test
npm run build      # dist/cognitive-captcha.js + dist/types/
```

The element extends `HTMLElement`, so import the module from browser code only.
