import * as path from 'path';
import type * as puppeteer from 'puppeteer';
import type { eventWithTime, listenerHandler } from '@sentry/rrweb-types';
import { EventType, IncrementalSource } from '@sentry/rrweb-types';
import type { recordOptions } from '../../src/types';
import type { CanvasManager } from '../../src/record/observers/canvas/canvas-manager';
import { launchPuppeteer } from '../utils';

interface IWindow extends Window {
  rrweb: {
    record: (
      options: recordOptions<eventWithTime>,
    ) => listenerHandler | undefined;
    CanvasManager: typeof CanvasManager;
  };
  trustedTypes: {
    createPolicy(
      name: string,
      rules: { createScriptURL(url: string): string },
    ): { createScriptURL(url: string): string };
  };
  events: eventWithTime[];
  violations: string[];
}

describe('canvas worker with Trusted Types', () => {
  vi.setConfig({ testTimeout: 100_000 });

  let browser: puppeteer.Browser;
  let page: puppeteer.Page;

  beforeAll(async () => {
    browser = await launchPuppeteer();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent('<canvas id="canvas"></canvas>');
    await page.addScriptTag({
      path: path.resolve(__dirname, '../../dist/rrweb.umd.cjs'),
    });
    // Enforced only now, because `addScriptTag` itself is a Trusted Types sink.
    await page.evaluate(() => {
      const win = window as unknown as IWindow;
      win.events = [];
      win.violations = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        win.violations.push(e.violatedDirective),
      );
      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = "require-trusted-types-for 'script'";
      document.head.appendChild(meta);
    });
  });

  afterEach(async () => {
    await page.close();
  });

  function startRecording(useTrustedTypes: boolean) {
    return page.evaluate((useTrustedTypes) => {
      const win = window as unknown as IWindow;
      const policy = win.trustedTypes.createPolicy('test', {
        createScriptURL: (url) => url,
      });
      document
        .querySelector('canvas')!
        .getContext('2d')!
        .fillRect(0, 0, 10, 10);
      win.rrweb.record({
        recordCanvas: true,
        sampling: { canvas: 10 },
        getCanvasManager: (options) =>
          new win.rrweb.CanvasManager({
            ...options,
            getTrustedScriptURL: useTrustedTypes
              ? (url) => policy.createScriptURL(url)
              : undefined,
          }),
        emit: (event) => void win.events.push(event),
      });
    }, useTrustedTypes);
  }

  it('records when getTrustedScriptURL returns a TrustedScriptURL', async () => {
    await startRecording(true);

    await page.waitForFunction(
      (type, source) =>
        (window as unknown as IWindow).events.some(
          (e) =>
            e.type === type && 'source' in e.data && e.data.source === source,
        ),
      {},
      EventType.IncrementalSnapshot,
      IncrementalSource.CanvasMutation,
    );
    expect(
      await page.evaluate(() => (window as unknown as IWindow).violations),
    ).toEqual([]);
  });

  it('is blocked without getTrustedScriptURL', async () => {
    await startRecording(false);

    await page.waitForFunction(
      () => (window as unknown as IWindow).violations.length > 0,
    );
    expect(
      await page.evaluate(() => (window as unknown as IWindow).violations),
    ).toEqual(['require-trusted-types-for']);
  });
});
