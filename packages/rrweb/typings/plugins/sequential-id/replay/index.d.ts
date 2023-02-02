import type { SequentialIdOptions } from '../record';
import { ReplayPlugin } from '../../../types';
type Options = SequentialIdOptions & {
    warnOnMissingId: boolean;
};
export declare const getReplaySequentialIdPlugin: (options?: Partial<Options>) => ReplayPlugin;
export {};
