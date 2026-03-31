import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import { stringifySnapshots } from '../../../rrweb/test/utils';
import { createServer, ViteDevServer } from 'vite';
import * as puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import type { eventWithTime } from '@sentry-internal/rrweb-types';

export async function launchPuppeteer(
  options?: Parameters<(typeof puppeteer)['launch']>[0],
) {
  return await puppeteer.launch({
    headless: process.env.PUPPETEER_HEADLESS ? true : false,
    defaultViewport: {
      width: 1920,
      height: 1080,
    },
    args: ['--no-sandbox'],
    ...options,
  });
}

/**
 * Filter out console events originating from Vite's injected client script.
 * Vite 6 logs messages like "[vite] connected" or "[vite] failed to connect"
 * that pollute our snapshots.
 */
function filterViteClientEvents(snapshots: eventWithTime[]): eventWithTime[] {
  return snapshots.filter((event) => {
    if (event.type !== 6) return true;
    const trace = (event.data as any)?.payload?.trace;
    if (!Array.isArray(trace)) return true;
    return !trace.some((t: string) => t.includes('@vite/client'));
  });
}

export function assertSnapshot(snapshots: eventWithTime[]) {
  expect(snapshots).toBeDefined();
  expect(
    stringifySnapshots(filterViteClientEvents(snapshots)),
  ).toMatchSnapshot();
}

describe('rrweb-plugin-console-record', () => {
  // vi.setConfig({ testTimeout: 120_000 });
  let server: ViteDevServer;
  let serverUrl: string;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    server = await createServer({
      preview: { port: 3000 },
      mode: 'test',
      server: { hmr: false },
    });
    await server.listen();
    serverUrl = server.resolvedUrls!.local[0];
    browser = await launchPuppeteer();
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
    await server.close();
  });

  it('should handle recursive console messages', async () => {
    await page.goto(`${serverUrl}test/html/log.html`);

    await page.evaluate(() => {
      // Some frameworks like Vue.js use proxies to implement reactivity.
      // This can cause infinite loops when logging objects.
      let recursiveTarget = { foo: 'bar', proxied: 'i-am', proxy: null };
      let count = 0;

      const handler = {
        get(target: any, prop: any, ...args: any[]) {
          if (prop === 'proxied') {
            if (count > 9) {
              return;
            }
            count++; // We don't want out test to get into an infinite loop...
            console.warn(
              'proxied was accessed so triggering a console.warn',
              target,
            );
          }
          return Reflect.get(target, prop, ...args);
        },
      };

      const proxy = new Proxy(recursiveTarget, handler);
      recursiveTarget.proxy = proxy;

      console.log('Proxied object:', proxy);
    });

    // await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    // The snapshots should containe 1 console log, not multiple.
    assertSnapshot(snapshots);
  });

  it('should record console messages', async () => {
    await page.goto(`${serverUrl}test/html/log.html`);

    await page.evaluate(() => {
      console.assert(0 === 0, 'assert');
      console.count('count');
      console.countReset('count');
      console.debug('debug');
      console.dir('dir');
      console.dirxml('dirxml');
      console.group();
      console.groupCollapsed();
      console.info('info');
      console.log('log');
      console.table('table');
      console.time();
      console.timeEnd();
      console.timeLog();
      console.trace('trace');
      console.warn('warn');
      console.clear();
      console.log(new TypeError('a message'));
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
    });

    await page.frames()[1].evaluate(() => {
      console.log('from iframe');
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });
});
