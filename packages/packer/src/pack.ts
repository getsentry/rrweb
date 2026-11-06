import { strFromU8, strToU8, zlibSync } from 'fflate';
import type { PackFn, eventWithTime } from '@sentry/rrweb-types';
import type { eventWithTimeAndPacker } from './base';
import { MARK } from './base';

export const pack: PackFn = (event: eventWithTime) => {
  const _e: eventWithTimeAndPacker = {
    ...event,
    v: MARK,
  };
  return strFromU8(zlibSync(strToU8(JSON.stringify(_e))), true);
};
