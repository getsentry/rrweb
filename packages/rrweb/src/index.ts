import record from './record';

import { Replayer } from './replay';
import canvasMutation from './replay/canvas';
import * as utils from './utils';

export {
  EventType,
  IncrementalSource,
  MouseInteractions,
  ReplayerEvents,
} from '@cartesianio/rrweb-types';

export type {
  canvasMutationParam,
  canvasMutationData,
  eventWithTime,
  fullSnapshotEvent,
  incrementalSnapshotEvent,
  inputData,
} from '@cartesianio/rrweb-types';

export type { ReplayPlugin, recordOptions } from './types';

export { record, Replayer, utils, canvasMutation };

export { deserializeArg } from './replay/canvas/deserialize-args';

export {
  CanvasManager,
  takeFullSnapshot,
  freezePage,
  addCustomEvent,
} from './record';
export type { CanvasManagerConstructorOptions } from './record';
