import * as fs from 'fs';
import * as path from 'path';
import type * as puppeteer from 'puppeteer';
import { vi } from 'vitest';
import type { recordOptions } from '../../src/types';
import {
  listenerHandler,
  eventWithTime,
  EventType,
  IncrementalSource,
} from '@sentry/rrweb-types';
import { launchPuppeteer, waitForTimeout } from '../utils';

interface ISuite {
  code: string;
  browser: puppeteer.Browser;
  page: puppeteer.Page;
}

interface Recording {
  /** Stops recording. Returns the error `stop()` throws, if any. */
  stop: () => string | null;
  /** How many adoptedStyleSheets events were emitted after the full snapshot. */
  adoptedEvents: () => number;
}

interface IWindow extends Window {
  rrweb: {
    record: (
      options: recordOptions<eventWithTime>,
    ) => listenerHandler | undefined;
  };
  startRecording: () => Recording | null;
  lockedAdoptedStyleSheetsDescriptor: () => PropertyDescriptor;
}

/** Runs in the page. Adds the helpers in `IWindow` to `window`. */
function installHelpers(adoptedEvent: {
  type: EventType;
  source: IncrementalSource;
}) {
  const w = window as unknown as IWindow;

  w.startRecording = () => {
    const events: eventWithTime[] = [];
    const stop = w.rrweb.record({ emit: (e) => events.push(e) });
    if (typeof stop !== 'function') return null;
    // Ignore the full snapshot, which includes the currently adopted sheets.
    events.length = 0;
    return {
      stop: () => {
        try {
          stop();
          return null;
        } catch (e) {
          return String(e);
        }
      },
      adoptedEvents: () =>
        events.filter(
          (e) =>
            e.type === adoptedEvent.type &&
            e.data.source === adoptedEvent.source,
        ).length,
    };
  };

  w.lockedAdoptedStyleSheetsDescriptor = () => ({
    ...Object.getOwnPropertyDescriptor(
      Document.prototype,
      'adoptedStyleSheets',
    ),
    configurable: false,
  });
}

const ADOPTED_STYLESHEET_EVENT = {
  type: EventType.IncrementalSnapshot,
  source: IncrementalSource.AdoptedStyleSheet,
};

const setup = function (content: string): ISuite {
  const ctx = {} as ISuite;

  beforeAll(async () => {
    ctx.browser = await launchPuppeteer();
    const bundlePath = path.resolve(__dirname, '../../dist/rrweb.umd.cjs');
    ctx.code = fs.readFileSync(bundlePath, 'utf8');
  });

  beforeEach(async () => {
    ctx.page = await ctx.browser.newPage();
    await ctx.page.goto('about:blank');
    await ctx.page.setContent(content);
    await ctx.page.evaluate(ctx.code);
    await ctx.page.evaluate(installHelpers, ADOPTED_STYLESHEET_EVENT);
  });

  afterEach(async () => {
    await ctx.page.close();
  });

  afterAll(async () => {
    await ctx.browser.close();
  });

  return ctx;
};

describe('adoptedStyleSheets patch when the property gets locked', () => {
  vi.setConfig({ testTimeout: 10_000 });

  const ctx = setup('<!DOCTYPE html><html><body></body></html>');

  it('removes the patch on stop when nothing is locked', async () => {
    const result = await ctx.page.evaluate(() => {
      const w = window as unknown as IWindow;
      const recording = w.startRecording()!;
      document.adoptedStyleSheets = [new CSSStyleSheet()];
      const stopError = recording.stop();
      const adoptedWhileRecording = recording.adoptedEvents();
      document.adoptedStyleSheets = [new CSSStyleSheet()];
      return {
        stopError,
        adoptedWhileRecording,
        adoptedAfterStop: recording.adoptedEvents() - adoptedWhileRecording,
        hasOwnPropertyAfterStop: Object.prototype.hasOwnProperty.call(
          document,
          'adoptedStyleSheets',
        ),
      };
    });

    expect(result.stopError).toBeNull();
    expect(result.adoptedWhileRecording).toBe(1);
    expect(result.adoptedAfterStop).toBe(0);
    expect(result.hasOwnPropertyAfterStop).toBe(false);
  });

  it('stops cleanly when Document.prototype was locked before recording', async () => {
    const result = await ctx.page.evaluate(() => {
      const w = window as unknown as IWindow;
      Object.defineProperty(
        Document.prototype,
        'adoptedStyleSheets',
        w.lockedAdoptedStyleSheetsDescriptor(),
      );

      const first = w.startRecording()!;
      document.adoptedStyleSheets = [new CSSStyleSheet()];
      const firstStopError = first.stop();

      const second = w.startRecording()!;
      document.adoptedStyleSheets = [new CSSStyleSheet()];
      const secondStopError = second.stop();

      return {
        firstStopError,
        firstAdopted: first.adoptedEvents(),
        secondStopError,
        secondAdopted: second.adoptedEvents(),
        hasOwnPropertyAfterStop: Object.prototype.hasOwnProperty.call(
          document,
          'adoptedStyleSheets',
        ),
      };
    });

    expect(result.firstStopError).toBeNull();
    expect(result.firstAdopted).toBe(1);
    expect(result.secondStopError).toBeNull();
    expect(result.secondAdopted).toBe(1);
    expect(result.hasOwnPropertyAfterStop).toBe(false);
  });

  it('stops cleanly when our property is locked during recording', async () => {
    const result = await ctx.page.evaluate(() => {
      const w = window as unknown as IWindow;
      const first = w.startRecording()!;
      document.adoptedStyleSheets = [new CSSStyleSheet()];
      // Keeps rrweb's getter and setter, but locks them in place.
      Object.defineProperty(document, 'adoptedStyleSheets', {
        configurable: false,
      });
      const firstStopError = first.stop();
      const firstAdopted = first.adoptedEvents();

      // rrweb's setter stays behind, but no longer records.
      document.adoptedStyleSheets = [new CSSStyleSheet(), new CSSStyleSheet()];
      const adoptedAfterStop = first.adoptedEvents() - firstAdopted;
      const sheetsApplied = document.adoptedStyleSheets.length === 2;

      // The property is still locked, so this recording skips the patch.
      const second = w.startRecording()!;
      document.adoptedStyleSheets = [new CSSStyleSheet()];
      const secondStopError = second.stop();

      return {
        firstStopError,
        firstAdopted,
        adoptedAfterStop,
        sheetsApplied,
        secondStopError,
        secondAdopted: second.adoptedEvents(),
      };
    });

    expect(result.firstStopError).toBeNull();
    expect(result.firstAdopted).toBe(1);
    expect(result.adoptedAfterStop).toBe(0);
    expect(result.sheetsApplied).toBe(true);
    expect(result.secondStopError).toBeNull();
    expect(result.secondAdopted).toBe(0);
  });

  it('stops cleanly when the document is sealed during recording', async () => {
    const result = await ctx.page.evaluate(() => {
      const w = window as unknown as IWindow;
      const first = w.startRecording()!;
      document.adoptedStyleSheets = [new CSSStyleSheet()];
      Object.seal(document);
      const firstStopError = first.stop();
      const firstAdopted = first.adoptedEvents();

      document.adoptedStyleSheets = [new CSSStyleSheet(), new CSSStyleSheet()];
      const adoptedAfterStop = first.adoptedEvents() - firstAdopted;
      const sheetsApplied = document.adoptedStyleSheets.length === 2;

      const second = w.startRecording()!;
      document.adoptedStyleSheets = [new CSSStyleSheet()];
      const secondStopError = second.stop();

      return {
        firstStopError,
        firstAdopted,
        adoptedAfterStop,
        sheetsApplied,
        secondStopError,
        secondAdopted: second.adoptedEvents(),
      };
    });

    expect(result.firstStopError).toBeNull();
    expect(result.firstAdopted).toBe(1);
    expect(result.adoptedAfterStop).toBe(0);
    expect(result.sheetsApplied).toBe(true);
    expect(result.secondStopError).toBeNull();
    expect(result.secondAdopted).toBe(0);
  });

  it('skips the patch when the document already has a locked own property', async () => {
    const result = await ctx.page.evaluate(() => {
      const w = window as unknown as IWindow;
      Object.defineProperty(
        document,
        'adoptedStyleSheets',
        w.lockedAdoptedStyleSheetsDescriptor(),
      );

      const recording = w.startRecording();
      document.adoptedStyleSheets = [new CSSStyleSheet()];
      return {
        started: recording !== null,
        sheetsApplied: document.adoptedStyleSheets.length === 1,
        stopError: recording?.stop(),
        adopted: recording?.adoptedEvents(),
      };
    });

    expect(result.started).toBe(true);
    expect(result.sheetsApplied).toBe(true);
    expect(result.stopError).toBeNull();
    expect(result.adopted).toBe(0);
  });

  it('skips the patch when the document was sealed before recording', async () => {
    const result = await ctx.page.evaluate(() => {
      const w = window as unknown as IWindow;
      Object.seal(document);

      const recording = w.startRecording();
      document.adoptedStyleSheets = [new CSSStyleSheet()];
      return {
        started: recording !== null,
        sheetsApplied: document.adoptedStyleSheets.length === 1,
        stopError: recording?.stop(),
        adopted: recording?.adoptedEvents(),
      };
    });

    expect(result.started).toBe(true);
    expect(result.sheetsApplied).toBe(true);
    expect(result.stopError).toBeNull();
    expect(result.adopted).toBe(0);
  });
});

describe('record teardown', () => {
  vi.setConfig({ testTimeout: 10_000 });

  const ctx = setup(
    '<!DOCTYPE html><html><body><iframe></iframe></body></html>',
  );

  it('cleans up the other documents when one cleanup step throws', async () => {
    await ctx.page.evaluate(() => {
      const w = window as unknown as IWindow & {
        events: eventWithTime[];
        stop: listenerHandler | undefined;
      };
      w.events = [];
      w.stop = w.rrweb.record({
        emit: (e) => w.events.push(e),
        plugins: [
          {
            name: 'throws-in-main-document',
            // The main document is observed before the iframe, so its
            // cleanup runs first.
            observer: (_cb, win) => () => {
              if (win === window) throw new Error('cleanup failed');
            },
            options: {},
          },
        ],
      });
    });
    // Let the iframe load and get observed.
    await waitForTimeout(100);
    const result = await ctx.page.evaluate(async () => {
      const w = window as unknown as {
        events: eventWithTime[];
        stop: listenerHandler | undefined;
      };
      let stopError: string | null = null;
      try {
        w.stop?.();
      } catch (e) {
        stopError = String(e);
      }
      w.events = [];
      const iframeBody =
        document.querySelector('iframe')!.contentDocument!.body;
      iframeBody.setAttribute('data-x', '1');
      iframeBody.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { stopError, eventsAfterStop: w.events.length };
    });
    expect(result).toEqual({
      stopError: 'Error: cleanup failed',
      eventsAfterStop: 0,
    });
  });
});
