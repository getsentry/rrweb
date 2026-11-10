import type { IWindow, listenerHandler } from '@sentry/rrweb-types';
import { patch } from '../../../utils';

/**
 * Calls `onDraw` with the canvas whenever one of its 2D context methods is
 * called. Unlike `initCanvas2DMutationObserver`, it does not serialize the
 * call, so it is cheap enough to run for every draw.
 */
export default function initCanvas2DDrawObserver(
  onDraw: (canvas: HTMLCanvasElement) => void,
  win: IWindow,
): listenerHandler {
  const handlers: listenerHandler[] = [];
  const prototype = win.CanvasRenderingContext2D.prototype;
  for (const prop of Object.getOwnPropertyNames(prototype)) {
    try {
      if (
        typeof prototype[prop as keyof CanvasRenderingContext2D] !== 'function'
      ) {
        continue;
      }
      handlers.push(
        patch(
          prototype,
          prop,
          function (
            original: (
              this: CanvasRenderingContext2D,
              ...args: unknown[]
            ) => unknown,
          ) {
            return function (
              this: CanvasRenderingContext2D,
              ...args: unknown[]
            ) {
              if (this.canvas) {
                onDraw(this.canvas);
              }
              return original.apply(this, args);
            };
          },
        ),
      );
    } catch {
      // accessors throw on the prototype; skip them
    }
  }
  return () => {
    handlers.forEach((h) => h());
  };
}
