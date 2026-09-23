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
  events: eventWithTime[];
}

interface IWindow extends Window {
  rrweb: {
    record: ((
      options: recordOptions<eventWithTime>,
    ) => listenerHandler | undefined) & {
      takeFullSnapshot: (isCheckout?: boolean) => void;
    };
  };
  emit: (e: eventWithTime) => undefined;
  failSnapshot: boolean;
}

const content = `
  <!DOCTYPE html>
  <html>
    <body>
      <div id='in'>some text</div>
    </body>
  </html>
`;

const countMutations = (events: eventWithTime[]) =>
  events.filter(
    (e) =>
      e.type === EventType.IncrementalSnapshot &&
      e.data.source === IncrementalSource.Mutation,
  ).length;

const countFullSnapshots = (events: eventWithTime[]) =>
  events.filter((e) => e.type === EventType.FullSnapshot).length;

describe('snapshot failure', function (this: ISuite) {
  vi.setConfig({ testTimeout: 100_000 });

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
    ctx.events = [];
    await ctx.page.exposeFunction('emit', (e: eventWithTime) => {
      if (e.type === EventType.DomContentLoaded || e.type === EventType.Load) {
        return;
      }
      ctx.events.push(e);
    });

    // `maskTextFn` runs inside `snapshot()`. Throwing from it is a
    // stand-in for any serialization failure, such as the Safari one
    // that this guards against.
    await ctx.page.evaluate(() => {
      const w = window as unknown as IWindow;
      w.failSnapshot = false;
      w.rrweb.record({
        emit: w.emit,
        maskAllText: true,
        maskTextFn: (text: string) => {
          if (w.failSnapshot) {
            throw new Error('serialization failed');
          }
          return text;
        },
      });
    });
    await waitForTimeout(50);
  });

  afterEach(async () => {
    await ctx.page.close();
  });

  afterAll(async () => {
    await ctx.browser.close();
  });

  const failACheckout = () =>
    ctx.page.evaluate(() => {
      const w = window as unknown as IWindow;
      w.failSnapshot = true;
      try {
        w.rrweb.record.takeFullSnapshot(true);
        return false;
      } catch (error) {
        return true;
      } finally {
        w.failSnapshot = false;
      }
    });

  it('keeps recording mutations after a failed checkout', async () => {
    expect(countFullSnapshots(ctx.events)).toBe(1);
    expect(await failACheckout()).toBe(true);

    await ctx.page.evaluate(() => {
      document
        .getElementById('in')!
        .appendChild(document.createElement('span'));
    });
    await waitForTimeout(100);

    expect(countMutations(ctx.events)).toBeGreaterThan(0);
  });

  it('can take a full snapshot again after a failed checkout', async () => {
    expect(await failACheckout()).toBe(true);

    await ctx.page.evaluate(() => {
      (window as unknown as IWindow).rrweb.record.takeFullSnapshot(true);
    });
    await waitForTimeout(100);

    expect(countFullSnapshots(ctx.events)).toBe(2);
  });
});
