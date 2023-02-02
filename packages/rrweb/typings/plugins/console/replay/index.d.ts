import { LogLevel, LogData } from '../record';
import { ReplayPlugin } from '../../../types';
type ReplayLogger = Partial<Record<LogLevel, (data: LogData) => void>>;
type LogReplayConfig = {
    level?: LogLevel[];
    replayLogger?: ReplayLogger;
};
export declare const getReplayConsolePlugin: (options?: LogReplayConfig) => ReplayPlugin;
export {};
