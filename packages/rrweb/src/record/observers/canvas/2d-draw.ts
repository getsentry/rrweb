import type { IWindow, listenerHandler } from '@sentry/rrweb-types';
import { patch } from '../../../utils';

// Methods that don't change pixels. They are often called thousands of times
// per frame (e.g. `lineTo` while building a path), so we leave them unpatched.
// This is a denylist on purpose: an unknown method is assumed to draw, so a
// method added to the spec later costs a little overhead instead of being missed.
const NON_DRAWING_METHODS = new Set([
  // path building; pixels only change on fill/stroke
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'arc',
  'arcTo',
  'ellipse',
  'bezierCurveTo',
  'quadraticCurveTo',
  'rect',
  'roundRect',
  // state and transforms
  'save',
  'restore',
  'translate',
  'rotate',
  'scale',
  'transform',
  'setTransform',
  'resetTransform',
  'setLineDash',
  'clip',
  // reads and factories
  'getImageData',
  'measureText',
  'isPointInPath',
  'isPointInStroke',
  'getTransform',
  'getLineDash',
  'getContextAttributes',
  'isContextLost',
  'createLinearGradient',
  'createRadialGradient',
  'createConicGradient',
  'createPattern',
  'createImageData',
]);

/**
 * Tracks the canvas `onDraw` was last called for. Draws to that canvas don't
 * call `onDraw` again until the owner resets `canvas` to `null`, which turns
 * repeated draws into a single comparison.
 */
export type LastDrawnCanvas = { canvas: HTMLCanvasElement | null };

/**
 * Calls `onDraw` with the canvas whenever one of its 2D context methods that
 * can change pixels is called. Unlike `initCanvas2DMutationObserver`, it does
 * not serialize the call, so it is cheap enough to run for every draw.
 */
export default function initCanvas2DDrawObserver(
  onDraw: (canvas: HTMLCanvasElement) => void,
  lastDrawn: LastDrawnCanvas,
  win: IWindow,
): listenerHandler {
  const handlers: listenerHandler[] = [];
  const prototype = win.CanvasRenderingContext2D.prototype;
  for (const prop of Object.getOwnPropertyNames(prototype)) {
    if (NON_DRAWING_METHODS.has(prop)) {
      continue;
    }
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
            return function (this: CanvasRenderingContext2D) {
              const canvas = this.canvas;
              if (canvas && canvas !== lastDrawn.canvas) {
                lastDrawn.canvas = canvas;
                onDraw(canvas);
              }
              // `arguments` avoids allocating an array on this hot path
              // oxlint-disable-next-line prefer-rest-params
              return original.apply(this, arguments as unknown as unknown[]);
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
