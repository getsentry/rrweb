import record from './record';
import { Replayer } from './replay';
import canvasMutation from './replay/canvas';
import { _mirror } from './utils';
import * as utils from './utils';

export {
  EventType,
  IncrementalSource,
  MouseInteractions,
  ReplayerEvents,
} from '@sentry-internal/rrweb-types';

export type {
  fullSnapshotEvent,
  incrementalSnapshotEvent,
  inputData,
  eventWithTime,
} from '@sentry-internal/rrweb-types';

export type { recordOptions } from './types';

const { addCustomEvent } = record;
const { freezePage } = record;

export {
  record,
  addCustomEvent,
  freezePage,
  Replayer,
  canvasMutation,
  _mirror as mirror,
  utils,
};
