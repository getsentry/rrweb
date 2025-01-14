<<<<<<< HEAD:packages/rrweb-player/typings/index.d.ts
import { playerConfig } from '@sentry-internal/rrweb/typings/types';
import { eventWithTime } from '@sentry-internal/rrweb-types';
import { Replayer } from '@sentry-internal/rrweb';
import { Mirror } from '@sentry-internal/rrweb-snapshot';
import { SvelteComponent } from 'svelte';
=======
import type { eventWithTime } from '@rrweb/types';
import type { Replayer, playerConfig } from '@rrweb/replay';
import type { Mirror } from 'rrweb-snapshot';
>>>>>>> ffff0b39 (Chore: Migrate build to vite (#1033)):packages/rrweb-player/src/types.ts

export type RRwebPlayerOptions = {
  target: HTMLElement;
  props: {
    /**
     * The events to replay.
     * @default `[]`
     */
    events: eventWithTime[];
    /**
     * The width of the replayer
     * @defaultValue `1024`
     */
    width?: number;
    /**
     * The height of the replayer
     * @defaultValue `576`
     */
    height?: number;
    /**
     * The maximum scale of the replayer (1 = 100%). Set to 0 for unlimited
     * @defaultValue `1`
     */
    maxScale?: number;
    /**
     * Whether to autoplay
     * @defaultValue `true`
     */
    autoPlay?: boolean;
    /**
     * The default speed to play at
     * @defaultValue `1`
     */
    speed?: number;
    /**
     * Speed options in UI
     * @defaultValue `[1, 2, 4, 8]`
     */
    speedOption?: number[];
    /**
     * Whether to show the controller UI
     * @defaultValue `true`
     */
    showController?: boolean;
    /**
     * Customize the custom events style with a key-value map
     * @defaultValue `{}`
     */
    tags?: Record<string, string>;
    /**
     * Customize the color of inactive periods indicator in the progress bar with a valid CSS color string.
     * @defaultValue `#D4D4D4`
     */
    inactiveColor?: string;
  } & Partial<playerConfig>;
};

export type RRwebPlayerExpose = {
  addEventListener: (
    event: string,
    handler: (params: unknown) => unknown,
  ) => void;
  addEvent: (event: eventWithTime) => void;
  getMetaData: Replayer['getMetaData'];
  getReplayer: () => Replayer;
  getMirror: () => Mirror;
  // getSilly: () => void;
  toggle: () => void;
  setSpeed: (speed: number) => void;
  toggleSkipInactive: () => void;
  toggleFullscreen: () => void;
  triggerResize: () => void;
  $set: (options: { width: number; height: number }) => void;
  play: () => void;
  pause: () => void;
  goto: (timeOffset: number, play?: boolean) => void;
  playRange: (
    timeOffset: number,
    endTimeOffset: number,
    startLooping?: boolean,
    afterHook?: undefined | (() => void),
  ) => void;
};
