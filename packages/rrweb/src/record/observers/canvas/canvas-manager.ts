import type {
  ICanvas,
  Mirror,
  DataURLOptions,
} from '@sentry-internal/rrweb-snapshot';
import type {
  blockClass,
  canvasManagerMutationCallback,
  canvasMutationCallback,
  canvasMutationCommand,
  canvasMutationWithType,
  IWindow,
  listenerHandler,
  CanvasArg,
  ImageBitmapDataURLWorkerResponse,
} from '@sentry-internal/rrweb-types';
import { isBlocked, onRequestAnimationFrame } from '../../../utils';
import { CanvasContext } from '@sentry-internal/rrweb-types';
import initCanvas2DMutationObserver from './2d';
import initCanvasContextObserver from './canvas';
import initCanvasWebGLMutationObserver from './webgl';
import { getImageBitmapDataUrlWorkerURL } from '@sentry-internal/rrweb-worker';
import { callbackWrapper, registerErrorHandler } from '../../error-handler';
import type { ErrorHandler } from '../../../types';

export type RafStamps = { latestId: number; invokeId: number | null };

type pendingCanvasMutationsMap = Map<
  HTMLCanvasElement,
  canvasMutationWithType[]
>;
type MaxCanvasSize = [number, number];
type SnapshotOptions = {
  skipRequestAnimationFrame?: boolean;
};

export interface CanvasManagerInterface {
  reset(): void;
  freeze(): void;
  unfreeze(): void;
  lock(): void;
  unlock(): void;
  snapshot(canvasElement?: HTMLCanvasElement, options?: SnapshotOptions): void;
  addWindow(win: IWindow): void;
  addShadowRoot(shadowRoot: ShadowRoot): void;
  resetShadowRoots(): void;
}

export interface CanvasManagerConstructorOptions {
  recordCanvas: boolean;
  enableManualSnapshot?: boolean;
  mutationCb: canvasMutationCallback;
  win: IWindow;
  blockClass: blockClass;
  blockSelector: string | null;
  unblockSelector: string | null;
  maxCanvasSize?: MaxCanvasSize | null;
  mirror: Mirror;
  dataURLOptions: DataURLOptions;
  errorHandler?: ErrorHandler;
  sampling?: 'all' | number;
}

export class CanvasManagerNoop implements CanvasManagerInterface {
  public reset() {
    // noop
  }
  public freeze() {
    // noop
  }
  public unfreeze() {
    // noop
  }
  public lock() {
    // noop
  }
  public unlock() {
    // noop
  }
  public snapshot() {
    // noop
  }
  public addWindow() {
    // noop
  }

  public addShadowRoot() {
    // noop
  }

  public resetShadowRoots() {
    // noop
  }
}

export class CanvasManager implements CanvasManagerInterface {
  private pendingCanvasMutations: pendingCanvasMutationsMap = new Map();
  private rafStamps: RafStamps = { latestId: 0, invokeId: null };
  private options: CanvasManagerConstructorOptions;
  private mirror: Mirror;

  private shadowDoms = new Set<WeakRef<ShadowRoot>>();
  private windowsSet = new WeakSet<IWindow>();
  private windows: WeakRef<IWindow>[] = [];

  private mutationCb: canvasMutationCallback;
  private restoreHandlers: listenerHandler[] = [];
  private frozen = false;
  private locked = false;

  private snapshotInProgressMap: Map<number, boolean> = new Map();
  private worker: Worker | null = null;

  private lastSnapshotTime = 0;

  public reset() {
    this.pendingCanvasMutations.clear();
    this.restoreHandlers.forEach((handler) => {
      try {
        handler();
      } catch (e) {
        //
      }
    });
    this.restoreHandlers = [];
    this.windowsSet = new WeakSet();
    this.windows = [];
    this.shadowDoms = new Set();
    this.worker?.terminate();
    this.worker = null;
    this.snapshotInProgressMap = new Map();
  }

  public freeze() {
    this.frozen = true;
  }

  public unfreeze() {
    this.frozen = false;
  }

  public lock() {
    this.locked = true;
  }

  public unlock() {
    this.locked = false;
  }

  constructor(options: CanvasManagerConstructorOptions) {
    const {
      enableManualSnapshot,
      sampling = 'all',
      win,
      recordCanvas,
      errorHandler,
    } = options;
    options.sampling = sampling;
    this.mutationCb = options.mutationCb;
    this.mirror = options.mirror;
    this.options = options;

    if (errorHandler) {
      registerErrorHandler(errorHandler);
    }
    if (
      (recordCanvas && typeof sampling === 'number') ||
      enableManualSnapshot
    ) {
      this.worker = this.initFPSWorker();
    }
    this.addWindow(win);

    if (enableManualSnapshot) {
      return;
    }

    callbackWrapper(() => {
      if (recordCanvas && sampling === 'all') {
        this.startRAFTimestamping();
        this.startPendingCanvasMutationFlusher();
      }
      if (recordCanvas && typeof sampling === 'number') {
        this.initCanvasFPSObserver();
      }
    })();
  }

  public addWindow(win: IWindow) {
    const {
      sampling = 'all',
      blockClass,
      blockSelector,
      unblockSelector,
      recordCanvas,
      enableManualSnapshot,
    } = this.options;
    if (this.windowsSet.has(win)) return;

    if (enableManualSnapshot) {
      this.windowsSet.add(win);
      this.windows.push(new WeakRef(win));
      return;
    }

    callbackWrapper(() => {
      if (recordCanvas && sampling === 'all') {
        this.initCanvasMutationObserver(
          win,
          blockClass,
          blockSelector,
          unblockSelector,
        );
      }
      if (recordCanvas && typeof sampling === 'number') {
        const canvasContextReset = initCanvasContextObserver(
          win,
          blockClass,
          blockSelector,
          unblockSelector,
          true,
        );
        this.restoreHandlers.push(() => {
          canvasContextReset();
        });
      }
    })();
    this.windowsSet.add(win);
    this.windows.push(new WeakRef(win));
  }

  public addShadowRoot(shadowRoot: ShadowRoot) {
    this.shadowDoms.add(new WeakRef(shadowRoot));
  }

  public resetShadowRoots() {
    this.shadowDoms = new Set();
  }

  public snapshot(
    canvasElement?: HTMLCanvasElement,
    options?: SnapshotOptions,
  ): void {
    if (options?.skipRequestAnimationFrame) {
      this.takeSnapshot(performance.now(), true, canvasElement);
      return;
    }
    onRequestAnimationFrame((timestamp) =>
      this.takeSnapshot(timestamp, true, canvasElement),
    );
  }

  private initFPSWorker(): Worker {
    const worker = new Worker(getImageBitmapDataUrlWorkerURL());
    worker.onmessage = (e) => {
      const data = e.data as ImageBitmapDataURLWorkerResponse;
      const { id } = data;
      this.snapshotInProgressMap.set(id, false);

      if (!('base64' in data)) return;

      const { base64, type, width, height } = data;
      this.mutationCb({
        id,
        type: CanvasContext['2D'],
        commands: [
          {
            property: 'clearRect', // wipe canvas
            args: [0, 0, width, height],
          },
          {
            property: 'drawImage', // draws (semi-transparent) image
            args: [
              {
                rr_type: 'ImageBitmap',
                args: [
                  {
                    rr_type: 'Blob',
                    data: [{ rr_type: 'ArrayBuffer', base64 }],
                    type,
                  },
                ],
              } as CanvasArg,
              0,
              0,
              // The below args are needed if we enforce a max size, we want to
              // retain the original size when drawing the image (which should be smaller)
              width,
              height,
            ],
          },
        ],
      });
    };
    return worker;
  }

  private processMutation: canvasManagerMutationCallback = (
    target,
    mutation,
  ) => {
    const newFrame =
      this.rafStamps.invokeId &&
      this.rafStamps.latestId !== this.rafStamps.invokeId;
    if (newFrame || !this.rafStamps.invokeId)
      this.rafStamps.invokeId = this.rafStamps.latestId;

    if (!this.pendingCanvasMutations.has(target)) {
      this.pendingCanvasMutations.set(target, []);
    }

    this.pendingCanvasMutations.get(target)!.push(mutation);
  };

  private initCanvasFPSObserver() {
    let rafId: number;

    if (!this.windows.length && !this.shadowDoms.size) {
      // If these are empty, then we won't be able to find any canvases to snapshot, so nothing to do here.
      return;
    }

    const rafCallback = (timestamp: DOMHighResTimeStamp) => {
      this.takeSnapshot(timestamp, false);
      rafId = onRequestAnimationFrame(rafCallback);
    };

    rafId = onRequestAnimationFrame(rafCallback);

    this.restoreHandlers.push(() => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    });
  }

  private initCanvasMutationObserver(
    win: IWindow,
    blockClass: blockClass,
    blockSelector: string | null,
    unblockSelector: string | null,
  ): void {
    const canvasContextReset = initCanvasContextObserver(
      win,
      blockClass,
      blockSelector,
      unblockSelector,
      false,
    );
    const canvas2DReset = initCanvas2DMutationObserver(
      this.processMutation.bind(this),
      win,
      blockClass,
      blockSelector,
      unblockSelector,
    );

    const canvasWebGL1and2Reset = initCanvasWebGLMutationObserver(
      this.processMutation.bind(this),
      win,
      blockClass,
      blockSelector,
      unblockSelector,
      this.mirror,
    );

    this.restoreHandlers.push(() => {
      canvasContextReset();
      canvas2DReset();
      canvasWebGL1and2Reset();
    });
  }

  /**
   * Returns all `canvas` elements that are not blocked by the given selectors. Searches all windows and shadow roots.
   */
  private getCanvasElements(
    blockClass: blockClass,
    blockSelector: string | null,
    unblockSelector: string | null,
  ): HTMLCanvasElement[] {
    const matchedCanvas: HTMLCanvasElement[] = [];

    const searchCanvas = (root: Document | ShadowRoot) => {
      root.querySelectorAll('canvas').forEach((canvas) => {
        if (
          !isBlocked(canvas, blockClass, blockSelector, unblockSelector, true)
        ) {
          matchedCanvas.push(canvas);
        }
      });
    };

    for (const item of this.windows) {
      const window = item.deref();
      let _document: Document | false | undefined;

      try {
        _document = window && window.document;
      } catch {
        // Accessing `window.document` can throw a security error:
        // "Failed to read a named property 'document' from 'Window': An
        // attempt was made to break through the security policy of the user
        // agent."
      }

      if (_document) {
        // This is not included in the `try` block above in case `searchCanvas()` throws
        searchCanvas(_document);
      }
    }

    // Search in shadow roots
    for (const item of this.shadowDoms) {
      const shadowRoot = item.deref();
      if (shadowRoot) {
        searchCanvas(shadowRoot);
      }
    }

    return matchedCanvas;
  }

  /**
   * Takes a snapshot of the provided canvas element, or will search all windows/shadow roots for canvases. Will self-throttle based on `options.sampling`.
   *
   * @returns `true` if the snapshot was taken, `false` if it was throttled.
   */
  private takeSnapshot(
    timestamp: DOMHighResTimeStamp,
    isManualSnapshot: boolean,
    canvasElement?: HTMLCanvasElement,
  ) {
    const {
      sampling,
      blockClass,
      blockSelector,
      unblockSelector,
      dataURLOptions,
      maxCanvasSize,
    } = this.options;
    const fps = sampling === 'all' ? 2 : sampling || 2;
    const timeBetweenSnapshots = 1000 / fps;
    const shouldThrottle =
      this.lastSnapshotTime &&
      timestamp - this.lastSnapshotTime < timeBetweenSnapshots;

    if (shouldThrottle) {
      return false;
    }

    this.lastSnapshotTime = timestamp;
    const canvases = canvasElement
      ? [canvasElement]
      : this.getCanvasElements(blockClass, blockSelector, unblockSelector);

    // Process all canvases concurrently
    canvases.forEach((canvas) => {
      const id = this.mirror.getId(canvas);

      // Check if canvas is valid and not already being processed
      if (
        !this.mirror.hasNode(canvas) ||
        !canvas.width ||
        !canvas.height ||
        this.snapshotInProgressMap.get(id)
      ) {
        return;
      }

      this.snapshotInProgressMap.set(id, true);

      // Handle WebGL context preservation
      if (
        !isManualSnapshot &&
        ['webgl', 'webgl2'].includes((canvas as ICanvas).__context)
      ) {
        const context = canvas.getContext((canvas as ICanvas).__context) as
          | WebGLRenderingContext
          | WebGL2RenderingContext
          | null;

        if (context?.getContextAttributes()?.preserveDrawingBuffer === false) {
          // Hack to load canvas back into memory so `createImageBitmap` can grab it's contents.
          // Context: https://twitter.com/Juice10/status/1499775271758704643
          // Preferably we set `preserveDrawingBuffer` to true, but that's not always possible,
          // especially when canvas is loaded before rrweb.
          // This hack can wipe the background color of the canvas in the (unlikely) event that
          // the canvas background was changed but clear was not called directly afterwards.
          // Example of this hack having negative side effect: https://visgl.github.io/react-map-gl/examples/layers
          context.clear(context.COLOR_BUFFER_BIT);
        }
      }

      createImageBitmap(canvas)
        .then((bitmap) => {
          this.worker?.postMessage(
            {
              id,
              bitmap,
              width: canvas.width,
              height: canvas.height,
              dataURLOptions,
              maxCanvasSize,
            },
            [bitmap],
          );
        })
        .catch((error) => {
          callbackWrapper(() => {
            this.snapshotInProgressMap.delete(id);
            throw error;
          })();
        });
    });

    return true;
  }

  private startPendingCanvasMutationFlusher() {
    onRequestAnimationFrame(() => this.flushPendingCanvasMutations());
  }

  private startRAFTimestamping() {
    const setLatestRAFTimestamp = (timestamp: DOMHighResTimeStamp) => {
      this.rafStamps.latestId = timestamp;
      onRequestAnimationFrame(setLatestRAFTimestamp);
    };
    onRequestAnimationFrame(setLatestRAFTimestamp);
  }

  flushPendingCanvasMutations() {
    this.pendingCanvasMutations.forEach(
      (_values: canvasMutationCommand[], canvas: HTMLCanvasElement) => {
        const id = this.mirror.getId(canvas);
        this.flushPendingCanvasMutationFor(canvas, id);
      },
    );
    onRequestAnimationFrame(() => this.flushPendingCanvasMutations());
  }

  flushPendingCanvasMutationFor(canvas: HTMLCanvasElement, id: number) {
    if (this.frozen || this.locked) {
      return;
    }

    const valuesWithType = this.pendingCanvasMutations.get(canvas);
    if (!valuesWithType || id === -1) return;

    const values = valuesWithType.map((value) => {
      const { type, ...rest } = value;
      return rest;
    });
    const { type } = valuesWithType[0];

    this.mutationCb({ id, type, commands: values });

    this.pendingCanvasMutations.delete(canvas);
  }
}
