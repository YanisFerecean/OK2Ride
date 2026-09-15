You are tasked with building a production-ready, high-precision cognitive capability assessment application ("Cognitive CAPTCHA") designed to evaluate driver sobriety and alertness before unlocking micromobility vehicles (e-scooters, e-bikes).

### WORKSPACE & ENVIRONMENT GOVERNANCE
1. **Operating Context**: You are running inside an existing GitHub repository workspace.
2. **Commit & Attribution Rule**: Do NOT add "Co-Authored-By: Claude", attribution footers, or AI signature trailers to any Git commit messages, pull requests, or code comments. Work cleanly inside the repository [cite: 1, 2].
3. **Build Setup**: Target TypeScript with Vite, Lit (or HTML5 Shadow DOM Web Components standard), and Node.js/npm tooling [cite: 3, 4].

### TECHNICAL SPECIFICATION

#### 1. Target Output Architecture
- **Package Format**: Standalone W3C Web Component / Custom Element registered as `<cognitive-captcha>` [cite: 3, 4].
- **Internal Implementation**: Modular TypeScript executing a strict Finite State Machine (FSM), rendered inside Shadow DOM for complete style and DOM encapsulation.
- **Interface & Events**:
  - *Input Attributes / Properties*: `max-lapses` (number), `time-limit-ms` (number), `difficulty` ('easy' | 'medium' | 'hard'), `theme` ('dark' | 'light').
  - *Output Events*: Dispatches `capability-passed` and `capability-failed` CustomEvents with detailed result payloads containing completion time, mean response time (RT), lapse count, and verification token.

#### 2. Cognitive Verification Test Engine (PVT-B & Spatial Alignment)
Implement a 2-stage verification pipeline based on standard Psychomotor Vigilance Task protocols [cite: 5, 6]:
- **Stage 1: Psychomotor Vigilance Task (PVT-B)** [cite: 6, 7]
  - Present a central visual stimulus after a randomized variable delay (between 1500 ms and 4500 ms).
  - Measure response time from stimulus appearance to touch/click with millisecond precision using `performance.now()` [cite: 8].
  - Classify responses:
    - Reaction < 100 ms: False Start / Anticipation Error (Invalidates trial) [cite: 9, 10].
    - 100 ms <= Reaction <= 450 ms: Valid Response [cite: 11, 12].
    - Reaction > 450 ms: Cognitive Lapse [cite: 5, 12].
  - Require 3 successful consecutive valid trials.
- **Stage 2: Spatial Orientation & Angle Matching** [cite: 13]
  - Present a visual target angle (e.g., align a scooter handle to a target arc of 45 degrees within a ±5 degree tolerance).
  - Require user to drag or tilt within a 3-second window to verify motor control and spatial awareness.

#### 3. State Machine Architecture
Define strict TypeScript interfaces and discriminated union types for State and Action:

```typescript
export type TestStage =

| { type: 'IDLE' }
| { type: 'INSTRUCTION' }
| { type: 'PVT_AWAITING_STIMULUS'; stimulusTime: number; delayMs: number }
| { type: 'PVT_STIMULUS_ACTIVE'; startTime: number }
| { type: 'PVT_RESULT_DISPLAY'; rtMs: number; isLapse: boolean }
| { type: 'SPATIAL_MATCHING'; targetAngle: number; currentAngle: number; startTime: number }
| { type: 'EVALUATED'; passed: boolean; details: AssessmentResult };

export type Action =

| { type: 'START_ASSESSMENT' }
| { type: 'TRIGGER_STIMULUS' }
| { type: 'TARGET_TAPPED'; tapTime: number }
| { type: 'UPDATE_SPATIAL_ANGLE'; angle: number }
| { type: 'COMPLETE_SPATIAL_STAGE' }
| { type: 'RESET_TEST' };
```

#### 4. UI & Styling
- Design a modern, mobile-first, high-contrast modal interface suitable for outdoor/nighttime visibility [cite: 14].
- Include visual indicators for current trial progress, real-time feedback (e.g., "Too Early!", "Fast!", "Lapse Detected"), and clear PASS/FAIL outcome screens [cite: 15].
- Isolate all styles inside the Shadow DOM using encapsulated CSS strings.

#### 5. Project File Structure to Generate
- `src/types.ts`: Core interfaces, state types, scoring metrics, and result payloads.
- `src/stateMachine.ts`: Deterministic state transition reducer handling timers via `performance.now()`.
- `src/components/CognitiveCaptcha.ts`: Main W3C Web Component defining attributes, shadow root, event dispatches, and render loops.
- `src/index.ts`: Public export and element auto-registration script.
- `package.json`, `tsconfig.json`, & `vite.config.ts`: Complete Vite build setup compiling the component into a lightweight bundle (`dist/cognitive-captcha.js`).

Execute the creation of all required files, ensure strict type safety, configure Vite build scripts, and verify clean integration into the host repository.