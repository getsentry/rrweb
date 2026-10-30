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

interface IWindow extends Window {
  rrweb: {
    record: (
      options: recordOptions<eventWithTime>,
    ) => listenerHandler | undefined;
  };
}

/** How another script on the page locks `adoptedStyleSheets`. */
type Lock =
  | 'none'
  // Before recording: lock the prototype's property.
  | 'prototype'
  // Before recording: add a locked own property to `document`.
  | 'ownPropertyBeforeRecord'
  // During recording: lock our own property on `document`.
  | 'ownPropertyDuringRecord'
  // During recording: `Object.seal(document)`.
  | 'sealDuringRecord';

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
  });

  afterEach(async () => {
    await ctx.page.close();
  });

  afterAll(async () => {
    await ctx.browser.close();
  });

  return ctx;
};

/**
 * Records, adopts a stylesheet, stops, then adopts another stylesheet, with
 * `adoptedStyleSheets` locked at the given point.
 */
async function recordWithLock(page: puppeteer.Page, lock: Lock) {
  return page.evaluate(
    (lock, adoptedEvent) => {
      const lockedDescriptor = {
        ...Object.getOwnPropertyDescriptor(
          Document.prototype,
          'adoptedStyleSheets',
        ),
        configurable: false,
      };
      if (lock === 'prototype') {
        Object.defineProperty(
          Document.prototype,
          'adoptedStyleSheets',
          lockedDescriptor,
        );
      } else if (lock === 'ownPropertyBeforeRecord') {
        Object.defineProperty(document, 'adoptedStyleSheets', lockedDescriptor);
      }

      const events: eventWithTime[] = [];
      const { record } = (window as unknown as IWindow).rrweb;
      const stop = record({ emit: (e) => events.push(e) });
      const countAdopted = () =>
        events.filter(
          (e) =>
            e.type === adoptedEvent.type &&
            e.data.source === adoptedEvent.source,
        ).length;

      const sheet = new CSSStyleSheet();
      document.adoptedStyleSheets = [sheet];

      if (lock === 'ownPropertyDuringRecord') {
        Object.defineProperty(document, 'adoptedStyleSheets', {
          configurable: false,
        });
      } else if (lock === 'sealDuringRecord') {
        Object.seal(document);
      }

      let stopError: string | null = null;
      try {
        stop?.();
      } catch (e) {
        stopError = String(e);
      }
      const adoptedEventsWhileRecording = countAdopted();

      document.adoptedStyleSheets = [sheet, new CSSStyleSheet()];

      return {
        recordStarted: typeof stop === 'function',
        stopError,
        adoptedEventsWhileRecording,
        adoptedEventsAfterStop: countAdopted() - adoptedEventsWhileRecording,
        ownPropertyAfterStop: Object.prototype.hasOwnProperty.call(
          document,
          'adoptedStyleSheets',
        ),
        sheetsApplied: document.adoptedStyleSheets.length === 2,
      };
    },
    lock,
    ADOPTED_STYLESHEET_EVENT,
  );
}

/** Starts another recording and checks that adopting a sheet is recorded. */
async function recordAgain(page: puppeteer.Page) {
  return page.evaluate((adoptedEvent) => {
    const events: eventWithTime[] = [];
    const { record } = (window as unknown as IWindow).rrweb;
    const stop = record({ emit: (e) => events.push(e) });
    // Ignore the full snapshot's events.
    events.length = 0;
    document.adoptedStyleSheets = [new CSSStyleSheet()];
    let stopError: string | null = null;
    try {
      stop?.();
    } catch (e) {
      stopError = String(e);
    }
    return {
      stopError,
      adoptedEvents: events.filter(
        (e) =>
          e.type === adoptedEvent.type && e.data.source === adoptedEvent.source,
      ).length,
    };
  }, ADOPTED_STYLESHEET_EVENT);
}

describe('adoptedStyleSheets patch when the property gets locked', () => {
  vi.setConfig({ testTimeout: 30_000 });

  const ctx = setup('<!DOCTYPE html><html><body></body></html>');

  it('removes the patch on stop when nothing is locked', async () => {
    expect(await recordWithLock(ctx.page, 'none')).toEqual({
      recordStarted: true,
      stopError: null,
      adoptedEventsWhileRecording: 1,
      adoptedEventsAfterStop: 0,
      ownPropertyAfterStop: false,
      sheetsApplied: true,
    });
  });

  it('stops cleanly when Document.prototype was locked before recording', async () => {
    expect(await recordWithLock(ctx.page, 'prototype')).toEqual({
      recordStarted: true,
      stopError: null,
      adoptedEventsWhileRecording: 1,
      adoptedEventsAfterStop: 0,
      ownPropertyAfterStop: false,
      sheetsApplied: true,
    });
    expect(await recordAgain(ctx.page)).toEqual({
      stopError: null,
      adoptedEvents: 1,
    });
  });

  it('stops cleanly and reuses the patch when our property is locked during recording', async () => {
    expect(await recordWithLock(ctx.page, 'ownPropertyDuringRecord')).toEqual({
      recordStarted: true,
      stopError: null,
      adoptedEventsWhileRecording: 1,
      adoptedEventsAfterStop: 0,
      // Can't be removed, so it stays behind as a pass-through.
      ownPropertyAfterStop: true,
      sheetsApplied: true,
    });
    expect(await recordAgain(ctx.page)).toEqual({
      stopError: null,
      adoptedEvents: 1,
    });
  });

  it('stops cleanly and reuses the patch when the document is sealed during recording', async () => {
    expect(await recordWithLock(ctx.page, 'sealDuringRecord')).toEqual({
      recordStarted: true,
      stopError: null,
      adoptedEventsWhileRecording: 1,
      adoptedEventsAfterStop: 0,
      ownPropertyAfterStop: true,
      sheetsApplied: true,
    });
    expect(await recordAgain(ctx.page)).toEqual({
      stopError: null,
      adoptedEvents: 1,
    });
  });

  it('skips the patch when the document already has a locked own property', async () => {
    expect(await recordWithLock(ctx.page, 'ownPropertyBeforeRecord')).toEqual({
      recordStarted: true,
      stopError: null,
      adoptedEventsWhileRecording: 0,
      adoptedEventsAfterStop: 0,
      ownPropertyAfterStop: true,
      sheetsApplied: true,
    });
  });
});

describe('record teardown', () => {
  vi.setConfig({ testTimeout: 30_000 });

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
