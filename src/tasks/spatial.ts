/**
 * Spatial orientation / angle matching.
 *
 * A target arc is shown on a steering dial; the rider rotates the handlebar
 * into it (drag or tilt) and releases within the window. Passes when the
 * released angle is within tolerance; the window expiring while the handlebar
 * is in the zone also passes.
 */

import type { AssessmentConfig, SpatialResult, TestStage } from '../types';
import { NOOP, clamp, fail, pass, round2, toStage, type TaskModule } from './shared';

/** Random signed target with magnitude in `[spatialTargetMinDeg, spatialTargetMaxDeg]`, whole degrees. */
export function pickTargetAngle(config: AssessmentConfig, random: () => number): number {
  const magnitude = config.spatialTargetMinDeg + random() * (config.spatialTargetMaxDeg - config.spatialTargetMinDeg);
  const sign = random() < 0.5 ? -1 : 1;
  return sign * Math.round(magnitude);
}

export const spatialTask: TaskModule = {
  id: 'spatial',
  stageTypes: ['SPATIAL_MATCHING'],

  start: (config, env) => ({ type: 'SPATIAL_MATCHING', targetAngle: pickTargetAngle(config, env.random), currentAngle: 0, startTime: env.now }),

  reduce(stage, action, config, env) {
    if (stage.type !== 'SPATIAL_MATCHING') return NOOP;
    if (action.type === 'UPDATE_SPATIAL_ANGLE') {
      const angle = Number.isFinite(action.angle) ? clamp(action.angle, -config.spatialMaxAngleDeg, config.spatialMaxAngleDeg) : 0;
      return angle === stage.currentAngle ? NOOP : toStage({ ...stage, currentAngle: angle });
    }
    if (action.type === 'COMPLETE_SPATIAL_STAGE') {
      const durationMs = round2(env.now - stage.startTime);
      const errorDeg = round2(Math.abs(stage.currentAngle - stage.targetAngle));
      const withinTolerance = errorDeg <= config.spatialToleranceDeg;
      const timedOut = durationMs >= config.spatialWindowMs;
      const result: SpatialResult = {
        test: 'spatial',
        targetAngle: stage.targetAngle,
        finalAngle: round2(stage.currentAngle),
        errorDeg,
        toleranceDeg: config.spatialToleranceDeg,
        durationMs,
        windowMs: config.spatialWindowMs,
        withinTolerance,
        timedOut,
      };
      if (withinTolerance) return pass(result);
      return fail(result, timedOut ? 'SPATIAL_TIMEOUT' : 'SPATIAL_OUT_OF_TOLERANCE');
    }
    return NOOP;
  },

  timerEffect(stage: TestStage, config, now) {
    if (stage.type !== 'SPATIAL_MATCHING') return null;
    return { action: { type: 'COMPLETE_SPATIAL_STAGE' }, delayMs: Math.max(0, stage.startTime + config.spatialWindowMs - now) };
  },
};
