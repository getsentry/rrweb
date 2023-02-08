/* tslint:disable no-console */

import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer';
import {
  recordOptions,
  listenerHandler,
  eventWithTime,
  EventType,
} from '../../src/types';
import { launchPuppeteer } from '../utils';

interface ISuite {
  code: string;
  browser: puppeteer.Browser;
  page: puppeteer.Page;
  events: eventWithTime[];
}

interface IWindow extends Window {
  rrweb: {
    record: (
      options: recordOptions<eventWithTime>,
    ) => listenerHandler | undefined;
    addCustomEvent<T>(tag: string, payload: T): void;
  };
  emit: (e: eventWithTime) => undefined;
}

const setup = function (this: ISuite, content: string): ISuite {
  const ctx = {} as ISuite;

  beforeAll(async () => {
    ctx.browser = await launchPuppeteer();

    const bundlePath = path.resolve(__dirname, '../../dist/rrweb.min.js');
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

    ctx.page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

    await ctx.page.evaluate(() => {
      const { record } = ((window as unknown) as IWindow).rrweb;
      record({
        recordCanvas: true,
        emit: ((window as unknown) as IWindow).emit,
      });
    });
  });

  afterEach(async () => {
    await ctx.page.close();
  });

  afterAll(async () => {
    await ctx.browser.close();
  });

  return ctx;
};

describe('record errors', function (this: ISuite) {
  jest.setTimeout(100_000);

  const ctx: ISuite = setup.call(
    this,
    `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { background: red; }
          </style>
        </head> 
        <body>
          <div id='in'></div>
          <div id='out'></div>

          <script>
            window.onerror = (message, source, lineno, colno, error) => {
              document.getElementById('out').textContent = error.__rrweb__ ? '__rrweb__' : 'no rrweb';
            }
          </script>
        </body>
      </html>
    `,
  );

  describe('CSSStyleSheet.prototype', () => {
    it('will tag errors from insertRule with __rrweb__', async () => {
      await ctx.page.evaluate(() => {
        // @ts-ignore rewrite this to something buggy
        window.CSSStyleSheet.prototype.insertRule = function () {
          // @ts-ignore
          window.doSomethignWrong();
        };
      });

      await ctx.page.evaluate(() => {
        const { record } = ((window as unknown) as IWindow).rrweb;
        record({
          recordCanvas: true,
          emit: ((window as unknown) as IWindow).emit,
        });

        // Trigger buggy style sheet insert
        setTimeout(() => {
          // @ts-ignore
          document.styleSheets[0].insertRule(
            'body { background: blue; }',
          );
        }, 50);
      });

      await ctx.page.waitForTimeout(100);

      const element = await ctx.page.$('#out');
      const text = await element!.evaluate((el) => el.textContent);

      expect(text).toEqual('__rrweb__');
    });

    it('will tag errors from deleteRule with __rrweb__', async () => {
      await ctx.page.evaluate(() => {
        // @ts-ignore rewrite this to something buggy
        window.CSSStyleSheet.prototype.deleteRule = function () {
          // @ts-ignore
          window.doSomethignWrong();
        };
      });

      await ctx.page.evaluate(() => {
        const { record } = ((window as unknown) as IWindow).rrweb;
        record({
          recordCanvas: true,
          emit: ((window as unknown) as IWindow).emit,
        });

        // Trigger buggy style sheet delete
        setTimeout(() => {
          document.styleSheets[0].deleteRule(0);
        }, 50);
      });

      await ctx.page.waitForTimeout(100);

      const element = await ctx.page.$('#out');
      const text = await element!.evaluate((el) => el.textContent);

      expect(text).toEqual('__rrweb__');
    });

    it('will tag errors from CSSGroupingRule.insertRule with __rrweb__', async () => {
      await ctx.page.evaluate(() => {
        // @ts-ignore rewrite this to something buggy
        window.CSSGroupingRule.prototype.insertRule = function () {
          // @ts-ignore
          window.doSomethignWrong();
        };
      });

      await ctx.page.evaluate(() => {
        const { record } = ((window as unknown) as IWindow).rrweb;
        record({
          recordCanvas: true,
          emit: ((window as unknown) as IWindow).emit,
        });

        // Trigger buggy style sheet insert
        setTimeout(() => {
          document.styleSheets[0].insertRule('@media {}');
          const atMediaRule = document.styleSheets[0]
            .cssRules[0] as CSSMediaRule;

          const ruleIdx0 = atMediaRule.insertRule(
            'body { background: #000; }',
            0,
          );
        }, 50);
      });

      await ctx.page.waitForTimeout(100);

      const element = await ctx.page.$('#out');
      const text = await element!.evaluate((el) => el.textContent);

      expect(text).toEqual('__rrweb__');
    });

    it('will tag errors from CSSGroupingRule.deleteRule with __rrweb__', async () => {
      await ctx.page.evaluate(() => {
        // @ts-ignore rewrite this to something buggy
        window.CSSGroupingRule.prototype.deleteRule = function () {
          // @ts-ignore
          window.doSomethignWrong();
        };
      });

      await ctx.page.evaluate(() => {
        const { record } = ((window as unknown) as IWindow).rrweb;
        record({
          recordCanvas: true,
          emit: ((window as unknown) as IWindow).emit,
        });

        // Trigger buggy style sheet delete
        setTimeout(() => {
          document.styleSheets[0].insertRule('@media {}');
          const atMediaRule = document.styleSheets[0]
            .cssRules[0] as CSSMediaRule;

          const ruleIdx0 = atMediaRule.deleteRule(0);
        }, 50);
      });

      await ctx.page.waitForTimeout(100);

      const element = await ctx.page.$('#out');
      const text = await element!.evaluate((el) => el.textContent);

      expect(text).toEqual('__rrweb__');
    });
  });

  it('will tag errors from mutation observer with __rrweb__', async () => {
    await ctx.page.evaluate(() => {
      const { record } = ((window as unknown) as IWindow).rrweb;
      record({
        recordCanvas: true,
        emit: ((window as unknown) as IWindow).emit,
      });

      // Trigger buggy mutation observer
      setTimeout(() => {
       const el = document.getElementById('in')!;

        // @ts-ignore we want to trigger an error in the mutation observer, which uses this
        el.getAttribute = undefined;

        el.setAttribute('data-attr', 'new');
      }, 50);
    });

    await ctx.page.waitForTimeout(100);

    const element = await ctx.page.$('#out');
    const text = await element!.evaluate((el) => el.textContent);

    expect(text).toEqual('__rrweb__');
  });
});
