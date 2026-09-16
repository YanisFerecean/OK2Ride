/**
 * Human-readable test names and failure messages.
 *
 * These are the English strings from the catalogue in `i18n.ts`, re-exported
 * as constants because they are part of the package's public API. For a
 * localised run the screens read `ctx.t` instead, which resolves from the
 * element's `lang`.
 */

import type { FailureReason, TestId } from '../types';
import { EN, type Strings, type TestStrings } from './i18n';

export type TestInfo = TestStrings;

export const TEST_INFO: Readonly<Record<TestId, TestInfo>> = EN.tests;

export const FAILURE_MESSAGES: Readonly<Record<FailureReason, string>> = EN.failures;

/** Test names and descriptions in the given language. */
export function testInfoFor(strings: Strings): Readonly<Record<TestId, TestInfo>> {
  return strings.tests;
}

/** Failure messages in the given language. */
export function failureMessagesFor(strings: Strings): Readonly<Record<FailureReason, string>> {
  return strings.failures;
}
