/**
 * User-facing text for `<ok2ride-check>`, in one place per language.
 *
 * The engine never touches text: every string a rider can read lives here,
 * including the test names and failure messages. Screens reach it through
 * `ctx.t`, so adding a language is data entry, not code.
 *
 * Interpolation is done with functions rather than placeholder syntax, so the
 * compiler checks every argument and word order stays free per language.
 */

import type { AssessmentConfig, FailureReason, StroopColor, TestId } from '../types';
import { formatMs, formatSeconds } from './dom';

export interface TestStrings {
  readonly name: string;
  readonly tagline: string;
  describe(config: AssessmentConfig): string;
}

export interface Strings {
  readonly code: string;

  /* shell */
  readonly stageReady: string;
  readonly stageInstructions: string;
  readonly stageResult: string;
  stageLabel(index: number, total: number, name: string): string;

  /* idle */
  readonly idleTitle: string;
  readonly idleBody: string;
  readonly idleStart: string;

  /* instructions */
  instructionTitle(count: number): string;
  readonly instructionBody: string;
  instructionTimeLimit(limitMs: number): string;
  readonly tiltToggle: string;
  readonly on: string;
  readonly off: string;
  readonly ready: string;

  /* per-test intro */
  introCounter(index: number, total: number): string;
  readonly introTimerNote: string;
  readonly go: string;

  /* pvt */
  readonly pvtTarget: string;
  pvtTrial(n: number): string;
  pvtCounts(lapses: number, maxLapses: number, early: number, maxEarly: number): string;
  readonly pvtCleanTaps: string;
  readonly pvtWaiting: string;
  readonly pvtWaitingHint: string;
  readonly pvtTap: string;
  pvtFast(rtMs: number): string;
  pvtTooEarly(rtMs: number | null): string;
  pvtLapse(rtMs: number | null): string;
  readonly pvtKeepGoing: string;
  readonly pvtStreakReset: string;

  /* go / no-go */
  readonly gngTarget: string;
  gngSignal(index: number, total: number): string;
  gngCounts(false_: number, maxFalse: number, missed: number, maxMissed: number): string;
  readonly gngGetReady: string;
  readonly gngHint: string;
  readonly gngGo: string;
  readonly gngStop: string;
  gngHit(rtMs: number | null): string;
  readonly gngHeld: string;
  readonly gngCommission: string;
  readonly gngOmission: string;
  readonly gngTooEarly: string;

  /* spatial */
  readonly spatialDial: string;
  readonly spatialLabel: string;
  spatialTarget(angle: string, toleranceDeg: number): string;
  readonly spatialDragTitle: string;
  readonly spatialTiltTitle: string;
  readonly spatialLockIn: string;
  angle(deg: number): string;

  /* trail */
  readonly trailBoard: string;
  trailNode(value: number): string;
  trailTitle(count: number): string;
  trailNext(value: number): string;
  errors(count: number, max: number): string;

  /* sequence */
  readonly sequenceBoard: string;
  sequenceTile(n: number): string;
  readonly sequenceEntered: string;
  readonly sequenceWatch: string;
  sequenceShowing(step: number, total: number): string;
  readonly sequenceYourTurn: string;
  sequenceProgress(entered: number, total: number): string;

  /* stroop */
  readonly stroopWord: string;
  readonly stroopOptions: string;
  readonly stroopTitle: string;
  readonly colors: Readonly<Record<StroopColor, string>>;
  stroopAria(word: string, ink: string): string;
  round(index: number, total: number): string;
  stroopCorrect(rtMs: number | null): string;
  readonly tooSlow: string;
  readonly stroopWrong: string;

  /* timing */
  readonly timingTarget: string;
  readonly timingTitle: string;
  timingTolerance(toleranceMs: number): string;
  readonly timingHint: string;
  timingAria(targetMs: number): string;
  missed(count: number, max: number): string;
  readonly timingNoTap: string;
  timingError(errorMs: number): string;
  readonly timingOnTarget: string;
  readonly timingOffTarget: string;

  /* search */
  readonly searchBoard: string;
  searchSymbol(glyph: string): string;
  readonly searchTitle: string;
  searchFound(rtMs: number | null): string;
  readonly searchWrong: string;

  /* result */
  readonly resultPass: string;
  readonly resultFail: string;
  readonly resultPassBody: string;
  readonly resultIncomplete: string;
  readonly resultNotReached: string;
  readonly resultTotalTime: string;
  readonly resultRetry: string;
  summaryPvt(meanRtMs: number | null, lapses: number): string;
  summarySpatial(errorDeg: number): string;
  summaryGoNoGo(commissions: number, omissions: number): string;
  summaryTrail(completed: boolean, durationMs: number, errors: number, reached: number, count: number): string;
  summarySequence(correct: number, total: number): string;
  summaryStroop(correct: number, total: number): string;
  summaryTiming(meanErrorMs: number | null, misses: number): string;
  summarySearch(found: number, total: number): string;

  /* tests & failures */
  readonly tests: Readonly<Record<TestId, TestStrings>>;
  readonly failures: Readonly<Record<FailureReason, string>>;
}

/* ------------------------------------------------------------------------ */
/* English (default)                                                         */
/* ------------------------------------------------------------------------ */

function pluralEn(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export const EN: Strings = {
  code: 'en',

  stageReady: 'Ready',
  stageInstructions: 'How it works',
  stageResult: 'Result',
  stageLabel: (index, total, name) => `Test ${index} of ${total} · ${name}`,

  idleTitle: 'Ride-readiness check',
  idleBody: 'A short set of quick reaction and coordination tests confirms you are alert and in control before the vehicle unlocks.',
  idleStart: 'Start check',

  instructionTitle: (count) => (count === 1 ? 'One quick test' : `${count} quick tests`),
  instructionBody: 'Tests are drawn at random for every check. Each one is explained again right before it starts.',
  instructionTimeLimit: (limitMs) => `Time limit: ${formatSeconds(limitMs)}.`,
  tiltToggle: 'Steer by tilting the phone',
  on: 'On',
  off: 'Off',
  ready: "I'm ready",

  introCounter: (index, total) => `Test ${index} of ${total}`,
  introTimerNote: 'The timer starts as soon as you press Go.',
  go: 'Go',

  pvtTarget: 'Reaction target',
  pvtTrial: (n) => `Trial ${n}`,
  pvtCounts: (lapses, maxLapses, early, maxEarly) => `Slow ${lapses}/${maxLapses} · Early ${early}/${maxEarly}`,
  pvtCleanTaps: 'Clean taps',
  pvtWaiting: 'Wait for yellow…',
  pvtWaitingHint: 'Tap the instant the panel lights up',
  pvtTap: 'TAP!',
  pvtFast: (rtMs) => `Fast! ${formatMs(rtMs)}`,
  pvtTooEarly: (rtMs) => (rtMs === null ? 'Too early!' : `Too early! ${formatMs(rtMs)}`),
  pvtLapse: (rtMs) => (rtMs === null ? 'Lapse detected · no response' : `Lapse detected · ${formatMs(rtMs)}`),
  pvtKeepGoing: 'Keep going',
  pvtStreakReset: 'Streak reset',

  gngTarget: 'Go / Stop signal',
  gngSignal: (index, total) => `Signal ${index} / ${total}`,
  gngCounts: (false_, maxFalse, missed, maxMissed) => `False taps ${false_}/${maxFalse} · Missed ${missed}/${maxMissed}`,
  gngGetReady: 'Get ready…',
  gngHint: 'Tap on green GO. Hold back on red STOP.',
  gngGo: 'GO',
  gngStop: 'STOP',
  gngHit: (rtMs) => (rtMs === null ? 'Hit!' : `Hit! ${formatMs(rtMs)}`),
  gngHeld: 'Held back. Good.',
  gngCommission: 'Tapped on STOP!',
  gngOmission: 'Missed the GO',
  gngTooEarly: 'Too early!',

  spatialDial: 'Handlebar angle',
  spatialLabel: 'Steering',
  spatialTarget: (angle, toleranceDeg) => `Target ${angle} · ±${toleranceDeg}°`,
  spatialDragTitle: 'Drag to turn the handlebar into the green zone, then let go',
  spatialTiltTitle: 'Tilt the phone until the handlebar sits in the green zone, then lock it in',
  spatialLockIn: 'Lock it in',
  angle: (deg) => {
    const rounded = Math.round(deg);
    if (rounded === 0) return '0°';
    return `${Math.abs(rounded)}° ${rounded < 0 ? 'left' : 'right'}`;
  },

  trailBoard: 'Number trail',
  trailNode: (value) => `Number ${value}`,
  trailTitle: (count) => `Tap 1 to ${count} in order`,
  trailNext: (value) => `Next: ${value}`,
  errors: (count, max) => `Errors ${count}/${max}`,

  sequenceBoard: 'Pattern tiles',
  sequenceTile: (n) => `Tile ${n}`,
  sequenceEntered: 'Tiles entered',
  sequenceWatch: 'Watch the pattern…',
  sequenceShowing: (step, total) => `Showing ${step} / ${total}`,
  sequenceYourTurn: 'Your turn: repeat the pattern',
  sequenceProgress: (entered, total) => `Entered ${entered} / ${total}`,

  stroopWord: 'Colour word',
  stroopOptions: 'Ink colour',
  stroopTitle: 'Tap the colour of the ink, not the word',
  colors: { red: 'Red', green: 'Green', blue: 'Blue', yellow: 'Yellow' },
  stroopAria: (word, ink) => `The word ${word} written in ${ink} ink`,
  round: (index, total) => `Round ${index} / ${total}`,
  stroopCorrect: (rtMs) => (rtMs === null ? 'Correct' : `Correct · ${formatMs(rtMs)}`),
  tooSlow: 'Too slow',
  stroopWrong: 'Wrong colour',

  timingTarget: 'Interval target',
  timingTitle: 'Tap when the time is up',
  timingTolerance: (toleranceMs) => `Within ${formatMs(toleranceMs)} counts as on target.`,
  timingHint: 'Tap when this much time has passed',
  timingAria: (targetMs) => `Tap after ${formatSeconds(targetMs)}`,
  missed: (count, max) => `Missed ${count}/${max}`,
  timingNoTap: 'No tap',
  timingError: (errorMs) => `${formatMs(Math.abs(errorMs))} ${errorMs > 0 ? 'late' : 'early'}`,
  timingOnTarget: 'On target',
  timingOffTarget: 'Off target',

  searchBoard: 'Symbol field',
  searchSymbol: (glyph) => `Symbol ${glyph}`,
  searchTitle: 'Tap the symbol that is different',
  searchFound: (rtMs) => (rtMs === null ? 'Found' : `Found · ${formatMs(rtMs)}`),
  searchWrong: 'Wrong symbol',

  resultPass: 'Clear to ride',
  resultFail: 'Check not passed',
  resultPassBody: 'You responded quickly and stayed in control.',
  resultIncomplete: 'The check could not be completed.',
  resultNotReached: 'not reached',
  resultTotalTime: 'Total time',
  resultRetry: 'Try again',
  summaryPvt: (meanRtMs, lapses) => (meanRtMs === null ? pluralEn(lapses, 'lapse') : `mean ${formatMs(meanRtMs)}`),
  summarySpatial: (errorDeg) => `${errorDeg.toFixed(1)}° off target`,
  summaryGoNoGo: (commissions, omissions) => `${pluralEn(commissions, 'false tap')}, ${omissions} missed`,
  summaryTrail: (completed, durationMs, errs, reached, count) =>
    completed ? `${formatSeconds(durationMs)}, ${pluralEn(errs, 'error')}` : `${reached} of ${count} reached`,
  summarySequence: (correct, total) => `${correct} of ${total} tiles`,
  summaryStroop: (correct, total) => `${correct} of ${total} correct`,
  summaryTiming: (meanErrorMs, misses) => (meanErrorMs === null ? pluralEn(misses, 'miss', 'misses') : `${formatMs(meanErrorMs)} off on average`),
  summarySearch: (found, total) => `${found} of ${total} found`,

  tests: {
    pvt: {
      name: 'Reaction',
      tagline: 'Tap the instant the panel flashes',
      describe: (c) =>
        `Wait for the panel to flash yellow, then tap it as fast as you can. Tapping early does not count. You need ${c.requiredValidTrials} clean taps in a row.`,
    },
    spatial: {
      name: 'Steering',
      tagline: 'Turn the handlebar into the zone',
      describe: (c) => `Turn the handlebar into the green zone and let go within ${formatSeconds(c.spatialWindowMs)}.`,
    },
    'go-no-go': {
      name: 'Go / Stop',
      tagline: 'Tap on GO, hold back on STOP',
      describe: (c) => `The panel will light up ${c.gngTrials} times. Tap as fast as you can when it shows green GO. Do not tap when it shows red STOP.`,
    },
    trail: {
      name: 'Number trail',
      tagline: 'Tap the numbers in order',
      describe: (c) => `Tap the numbers 1 to ${c.trailCount} in order as fast as you can. You have ${formatSeconds(c.trailWindowMs)}.`,
    },
    sequence: {
      name: 'Pattern memory',
      tagline: 'Repeat the pattern',
      describe: (c) => `Watch ${c.sequenceLength} tiles light up one after another, then tap the same tiles in the same order.`,
    },
    stroop: {
      name: 'Colour match',
      tagline: 'Tap the ink colour, not the word',
      describe: (c) => `A colour word appears written in a different colour. Tap the button matching the colour it is written in, not the word. ${c.stroopTrials} rounds.`,
    },
    timing: {
      name: 'Time sense',
      tagline: 'Tap when the interval has passed',
      describe: (c) =>
        `A target time appears, but nothing counts it down. Tap when you judge that much time has passed — within ${formatSeconds(c.timingToleranceMs)} either way. ${c.timingRounds} rounds.`,
    },
    search: {
      name: 'Odd one out',
      tagline: 'Find the symbol that differs',
      describe: (c) => `One symbol in the field is different from all the others. Find it and tap it before the round runs out. ${c.searchRounds} rounds.`,
    },
  },

  failures: {
    TOO_MANY_LAPSES: 'Too many slow reactions were detected.',
    TOO_MANY_FALSE_STARTS: 'Too many early taps were detected.',
    TIME_LIMIT_EXCEEDED: 'The check was not completed within the time limit.',
    SPATIAL_OUT_OF_TOLERANCE: 'The handlebar was released outside the target zone.',
    SPATIAL_TIMEOUT: 'The handlebar was not aligned before time ran out.',
    GO_NO_GO_COMMISSIONS: 'Too many taps on STOP signals.',
    GO_NO_GO_OMISSIONS: 'Too many GO signals were missed.',
    TRAIL_TOO_MANY_ERRORS: 'Too many numbers were tapped out of order.',
    TRAIL_TIMEOUT: 'The number trail was not finished in time.',
    SEQUENCE_INCORRECT: 'The pattern was not repeated correctly.',
    SEQUENCE_TIMEOUT: 'The pattern was not repeated in time.',
    STROOP_TOO_MANY_ERRORS: 'Too many colours were matched incorrectly.',
    TIMING_OFF_TARGET: 'Too many intervals were misjudged.',
    SEARCH_TOO_MANY_ERRORS: 'Too many wrong symbols were tapped.',
    HUMAN_CHECK_FAILED: 'The responses did not look like they came from a person.',
  },
};

/* ------------------------------------------------------------------------ */
/* German                                                                    */
/* ------------------------------------------------------------------------ */

function pluralDe(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export const DE: Strings = {
  code: 'de',

  stageReady: 'Bereit',
  stageInstructions: 'So funktioniert es',
  stageResult: 'Ergebnis',
  stageLabel: (index, total, name) => `Test ${index} von ${total} · ${name}`,

  idleTitle: 'Fahrtauglichkeits-Check',
  idleBody: 'Ein paar kurze Reaktions- und Koordinationstests bestätigen, dass du wach und aufmerksam bist, bevor das Fahrzeug entsperrt wird.',
  idleStart: 'Check starten',

  instructionTitle: (count) => (count === 1 ? 'Ein kurzer Test' : `${count} kurze Tests`),
  instructionBody: 'Die Tests werden bei jedem Check zufällig gezogen. Jeder wird direkt davor noch einmal erklärt.',
  instructionTimeLimit: (limitMs) => `Zeitlimit: ${formatSeconds(limitMs)}.`,
  tiltToggle: 'Mit Neigung des Handys lenken',
  on: 'An',
  off: 'Aus',
  ready: 'Ich bin bereit',

  introCounter: (index, total) => `Test ${index} von ${total}`,
  introTimerNote: 'Die Zeit läuft, sobald du auf Los drückst.',
  go: 'Los',

  pvtTarget: 'Reaktionsfläche',
  pvtTrial: (n) => `Durchgang ${n}`,
  pvtCounts: (lapses, maxLapses, early, maxEarly) => `Langsam ${lapses}/${maxLapses} · Zu früh ${early}/${maxEarly}`,
  pvtCleanTaps: 'Saubere Treffer',
  pvtWaiting: 'Warte auf Gelb…',
  pvtWaitingHint: 'Tippe, sobald die Fläche aufleuchtet',
  pvtTap: 'TIPPEN!',
  pvtFast: (rtMs) => `Schnell! ${formatMs(rtMs)}`,
  pvtTooEarly: (rtMs) => (rtMs === null ? 'Zu früh!' : `Zu früh! ${formatMs(rtMs)}`),
  pvtLapse: (rtMs) => (rtMs === null ? 'Aussetzer · keine Reaktion' : `Aussetzer · ${formatMs(rtMs)}`),
  pvtKeepGoing: 'Weiter so',
  pvtStreakReset: 'Serie zurückgesetzt',

  gngTarget: 'Los- / Stopp-Signal',
  gngSignal: (index, total) => `Signal ${index} / ${total}`,
  gngCounts: (false_, maxFalse, missed, maxMissed) => `Fehltipps ${false_}/${maxFalse} · Verpasst ${missed}/${maxMissed}`,
  gngGetReady: 'Gleich geht es los…',
  gngHint: 'Bei grünem LOS tippen. Bei rotem STOPP nicht tippen.',
  gngGo: 'LOS',
  gngStop: 'STOPP',
  gngHit: (rtMs) => (rtMs === null ? 'Treffer!' : `Treffer! ${formatMs(rtMs)}`),
  gngHeld: 'Zurückgehalten. Gut.',
  gngCommission: 'Auf STOPP getippt!',
  gngOmission: 'LOS verpasst',
  gngTooEarly: 'Zu früh!',

  spatialDial: 'Lenkerwinkel',
  spatialLabel: 'Lenken',
  spatialTarget: (angle, toleranceDeg) => `Ziel ${angle} · ±${toleranceDeg}°`,
  spatialDragTitle: 'Ziehe den Lenker in die grüne Zone und lass dann los',
  spatialTiltTitle: 'Neige das Handy, bis der Lenker in der grünen Zone steht, und bestätige dann',
  spatialLockIn: 'Bestätigen',
  angle: (deg) => {
    const rounded = Math.round(deg);
    if (rounded === 0) return '0°';
    return `${Math.abs(rounded)}° ${rounded < 0 ? 'links' : 'rechts'}`;
  },

  trailBoard: 'Zahlenpfad',
  trailNode: (value) => `Zahl ${value}`,
  trailTitle: (count) => `Tippe 1 bis ${count} der Reihe nach`,
  trailNext: (value) => `Als Nächstes: ${value}`,
  errors: (count, max) => `Fehler ${count}/${max}`,

  sequenceBoard: 'Musterfelder',
  sequenceTile: (n) => `Feld ${n}`,
  sequenceEntered: 'Eingegebene Felder',
  sequenceWatch: 'Merke dir das Muster…',
  sequenceShowing: (step, total) => `Zeige ${step} / ${total}`,
  sequenceYourTurn: 'Du bist dran: wiederhole das Muster',
  sequenceProgress: (entered, total) => `Eingegeben ${entered} / ${total}`,

  stroopWord: 'Farbwort',
  stroopOptions: 'Schriftfarbe',
  stroopTitle: 'Tippe die Schriftfarbe an, nicht das Wort',
  colors: { red: 'Rot', green: 'Grün', blue: 'Blau', yellow: 'Gelb' },
  stroopAria: (word, ink) => `Das Wort ${word} in ${ink} geschrieben`,
  round: (index, total) => `Runde ${index} / ${total}`,
  stroopCorrect: (rtMs) => (rtMs === null ? 'Richtig' : `Richtig · ${formatMs(rtMs)}`),
  tooSlow: 'Zu langsam',
  stroopWrong: 'Falsche Farbe',

  timingTarget: 'Zeitschätzung',
  timingTitle: 'Tippe, wenn die Zeit um ist',
  timingTolerance: (toleranceMs) => `Innerhalb von ${formatMs(toleranceMs)} gilt als getroffen.`,
  timingHint: 'Tippe, wenn so viel Zeit vergangen ist',
  timingAria: (targetMs) => `Nach ${formatSeconds(targetMs)} tippen`,
  missed: (count, max) => `Verfehlt ${count}/${max}`,
  timingNoTap: 'Nicht getippt',
  timingError: (errorMs) => `${formatMs(Math.abs(errorMs))} ${errorMs > 0 ? 'zu spät' : 'zu früh'}`,
  timingOnTarget: 'Getroffen',
  timingOffTarget: 'Daneben',

  searchBoard: 'Symbolfeld',
  searchSymbol: (glyph) => `Symbol ${glyph}`,
  searchTitle: 'Tippe das Symbol an, das sich unterscheidet',
  searchFound: (rtMs) => (rtMs === null ? 'Gefunden' : `Gefunden · ${formatMs(rtMs)}`),
  searchWrong: 'Falsches Symbol',

  resultPass: 'Bereit zur Fahrt',
  resultFail: 'Check nicht bestanden',
  resultPassBody: 'Du hast schnell reagiert und die Kontrolle behalten.',
  resultIncomplete: 'Der Check konnte nicht abgeschlossen werden.',
  resultNotReached: 'nicht erreicht',
  resultTotalTime: 'Gesamtzeit',
  resultRetry: 'Erneut versuchen',
  summaryPvt: (meanRtMs, lapses) => (meanRtMs === null ? pluralDe(lapses, 'Aussetzer', 'Aussetzer') : `Ø ${formatMs(meanRtMs)}`),
  summarySpatial: (errorDeg) => `${errorDeg.toFixed(1)}° daneben`,
  summaryGoNoGo: (commissions, omissions) => `${pluralDe(commissions, 'Fehltipp', 'Fehltipps')}, ${omissions} verpasst`,
  summaryTrail: (completed, durationMs, errs, reached, count) =>
    completed ? `${formatSeconds(durationMs)}, ${pluralDe(errs, 'Fehler', 'Fehler')}` : `${reached} von ${count} erreicht`,
  summarySequence: (correct, total) => `${correct} von ${total} Feldern`,
  summaryStroop: (correct, total) => `${correct} von ${total} richtig`,
  summaryTiming: (meanErrorMs, misses) => (meanErrorMs === null ? pluralDe(misses, 'Verfehlung', 'Verfehlungen') : `Ø ${formatMs(meanErrorMs)} daneben`),
  summarySearch: (found, total) => `${found} von ${total} gefunden`,

  tests: {
    pvt: {
      name: 'Reaktion',
      tagline: 'Tippe, sobald die Fläche aufleuchtet',
      describe: (c) =>
        `Warte, bis die Fläche gelb aufleuchtet, und tippe dann so schnell du kannst. Zu frühes Tippen zählt nicht. Du brauchst ${c.requiredValidTrials} saubere Treffer in Folge.`,
    },
    spatial: {
      name: 'Lenken',
      tagline: 'Bring den Lenker in die Zone',
      describe: (c) => `Bring den Lenker in die grüne Zone und lass innerhalb von ${formatSeconds(c.spatialWindowMs)} los.`,
    },
    'go-no-go': {
      name: 'Los / Stopp',
      tagline: 'Bei LOS tippen, bei STOPP zurückhalten',
      describe: (c) => `Die Fläche leuchtet ${c.gngTrials} Mal auf. Tippe so schnell du kannst, wenn sie grün LOS zeigt. Tippe nicht, wenn sie rot STOPP zeigt.`,
    },
    trail: {
      name: 'Zahlenpfad',
      tagline: 'Tippe die Zahlen der Reihe nach',
      describe: (c) => `Tippe die Zahlen 1 bis ${c.trailCount} so schnell wie möglich der Reihe nach an. Du hast ${formatSeconds(c.trailWindowMs)}.`,
    },
    sequence: {
      name: 'Mustergedächtnis',
      tagline: 'Wiederhole das Muster',
      describe: (c) => `Schau zu, wie ${c.sequenceLength} Felder nacheinander aufleuchten, und tippe dann dieselben Felder in derselben Reihenfolge an.`,
    },
    stroop: {
      name: 'Farbabgleich',
      tagline: 'Tippe die Schriftfarbe, nicht das Wort',
      describe: (c) =>
        `Ein Farbwort erscheint in einer anderen Farbe geschrieben. Tippe die Schaltfläche mit der Farbe an, in der es geschrieben steht, nicht das Wort. ${c.stroopTrials} Runden.`,
    },
    timing: {
      name: 'Zeitgefühl',
      tagline: 'Tippe, wenn das Intervall vorbei ist',
      describe: (c) =>
        `Eine Zielzeit erscheint, aber nichts zählt sie herunter. Tippe, wenn du meinst, dass so viel Zeit vergangen ist — auf ${formatSeconds(c.timingToleranceMs)} genau. ${c.timingRounds} Runden.`,
    },
    search: {
      name: 'Ausreißer finden',
      tagline: 'Finde das abweichende Symbol',
      describe: (c) => `Ein Symbol im Feld unterscheidet sich von allen anderen. Finde und tippe es an, bevor die Runde abläuft. ${c.searchRounds} Runden.`,
    },
  },

  failures: {
    TOO_MANY_LAPSES: 'Es wurden zu viele langsame Reaktionen festgestellt.',
    TOO_MANY_FALSE_STARTS: 'Es wurde zu oft zu früh getippt.',
    TIME_LIMIT_EXCEEDED: 'Der Check wurde nicht innerhalb des Zeitlimits abgeschlossen.',
    SPATIAL_OUT_OF_TOLERANCE: 'Der Lenker wurde außerhalb der Zielzone losgelassen.',
    SPATIAL_TIMEOUT: 'Der Lenker war nicht rechtzeitig ausgerichtet.',
    GO_NO_GO_COMMISSIONS: 'Zu oft auf STOPP getippt.',
    GO_NO_GO_OMISSIONS: 'Zu viele LOS-Signale verpasst.',
    TRAIL_TOO_MANY_ERRORS: 'Zu viele Zahlen wurden in falscher Reihenfolge angetippt.',
    TRAIL_TIMEOUT: 'Der Zahlenpfad wurde nicht rechtzeitig beendet.',
    SEQUENCE_INCORRECT: 'Das Muster wurde nicht korrekt wiederholt.',
    SEQUENCE_TIMEOUT: 'Das Muster wurde nicht rechtzeitig wiederholt.',
    STROOP_TOO_MANY_ERRORS: 'Zu viele Farben wurden falsch zugeordnet.',
    TIMING_OFF_TARGET: 'Zu viele Intervalle wurden falsch eingeschätzt.',
    SEARCH_TOO_MANY_ERRORS: 'Zu oft das falsche Symbol angetippt.',
    HUMAN_CHECK_FAILED: 'Die Eingaben wirkten nicht wie von einer Person.',
  },
};

/* ------------------------------------------------------------------------ */
/* Resolution                                                                */
/* ------------------------------------------------------------------------ */

export const LOCALES: Readonly<Record<string, Strings>> = { en: EN, de: DE };

export const DEFAULT_STRINGS: Strings = EN;

/**
 * Picks the strings for a BCP-47 tag, matching the primary subtag so `de-AT`
 * and `de-CH` resolve to German. Falls back to English for anything unknown.
 */
export function resolveStrings(lang: string | null | undefined): Strings {
  if (!lang) return DEFAULT_STRINGS;
  const primary = lang.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return LOCALES[primary] ?? DEFAULT_STRINGS;
}
