import record from './record';
import {
  Replayer,
  type playerConfig,
  type PlayerMachineState,
  type SpeedMachineState,
} from './replay';
import canvasMutation from './replay/canvas';
import * as utils from './utils';

export {
  EventType,
  IncrementalSource,
  MouseInteractions,
  ReplayerEvents,
} from '@sentry-internal/rrweb-types';

export type {
  canvasMutationParam,
  canvasMutationData,
  eventWithTime,
  fullSnapshotEvent,
  incrementalSnapshotEvent,
  inputData,
} from '@sentry-internal/rrweb-types';

export type { recordOptions, ReplayPlugin } from './types';
export { deserializeArg } from './replay/canvas/deserialize-args';
export {
  CanvasManager,
  addCustomEvent,
  freezePage,
  takeFullSnapshot,
} from './record';
export type { CanvasManagerConstructorOptions } from './record';

export {
  record,
  Replayer,
  playerConfig,
  PlayerMachineState,
  SpeedMachineState,
  canvasMutation,
  utils,
};
