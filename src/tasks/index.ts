import type { StageType, TestId, TestStage } from '../types';
import { goNoGoTask } from './goNoGo';
import { pvtTask } from './pvt';
import { searchTask } from './search';
import { sequenceTask } from './sequence';
import type { TaskModule } from './shared';
import { spatialTask } from './spatial';
import { stroopTask } from './stroop';
import { timingTask } from './timing';
import { trailTask } from './trail';

export type { TaskModule, TaskReduction } from './shared';

export const TASKS: Readonly<Record<TestId, TaskModule>> = {
  pvt: pvtTask,
  spatial: spatialTask,
  'go-no-go': goNoGoTask,
  trail: trailTask,
  sequence: sequenceTask,
  stroop: stroopTask,
  timing: timingTask,
  search: searchTask,
};

const TASK_BY_STAGE: ReadonlyMap<StageType, TaskModule> = new Map(
  Object.values(TASKS).flatMap((task) => task.stageTypes.map((type): [StageType, TaskModule] => [type, task])),
);

/** The task module that owns the given stage, or `null` for framework stages. */
export function taskForStage(stage: TestStage): TaskModule | null {
  return TASK_BY_STAGE.get(stage.type) ?? null;
}
