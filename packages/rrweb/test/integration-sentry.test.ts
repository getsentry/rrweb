import * as fs from 'fs';
import * as path from 'path';
import type * as puppeteer from 'puppeteer';
import {
  assertSnapshot,
  startServer,
  getServerURL,
  launchPuppeteer,
  replaceLast,
  generateRecordSnippet,
  ISuite,
} from './utils';
import type { recordOptions } from '../src/types';
import { eventWithTime, EventType, IncrementalSource } from '@rrweb/types';

/**
 * Used to filter scroll events out of snapshots as they are flakey
 */
function isNotScroll(snapshot: eventWithTime) {
  return !(
    snapshot.type === EventType.IncrementalSnapshot &&
    snapshot.data.source === IncrementalSource.Scroll
  );
}

describe('record integration tests', function (this: ISuite) {
  jest.setTimeout(10_000);

  const getHtml = (
    fileName: string,
    options: recordOptions<eventWithTime> = {},
  ): string => {
    const filePath = path.resolve(__dirname, `./html/${fileName}`);
    const html = fs.readFileSync(filePath, 'utf8');
    return replaceLast(
      html,
      '</body>',
      `
    <script>
      ${code}
      window.Date.now = () => new Date(Date.UTC(2018, 10, 15, 8)).valueOf();
      ${generateRecordSnippet(options)}
    </script>
    </body>
    `,
    );
  };

  let server: ISuite['server'];
  let serverURL: string;
  let code: ISuite['code'];
  let browser: ISuite['browser'];

  beforeAll(async () => {
    server = await startServer();
    serverURL = getServerURL(server);
    browser = await launchPuppeteer();

    const bundlePath = path.resolve(__dirname, '../dist/rrweb.min.js');
    const pluginsCode = [
      path.resolve(__dirname, '../dist/plugins/console-record.min.js'),
    ]
      .map((path) => fs.readFileSync(path, 'utf8'))
      .join();
    code = fs.readFileSync(bundlePath, 'utf8') + pluginsCode;
  });

  afterAll(async () => {
    await browser.close();
    server.close();
  });

  it('can configure onMutation', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');

    await page.setContent(
      getHtml.call(this, 'mutation-observer.html', {
        // XXX(sentry)
        // onMutation: `(mutations) => { window.lastMutationsLength = mutations.length; return mutations.length < 500 }`,
      }),
    );

    await page.evaluate(() => {
      const ul = document.querySelector('ul') as HTMLUListElement;

      for (let i = 0; i < 2000; i++) {
        const li = document.createElement('li');
        ul.appendChild(li);
        const p = document.querySelector('p') as HTMLParagraphElement;
        p.appendChild(document.createElement('span'));
      }
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);

    const lastMutationsLength = await page.evaluate(
      'window.lastMutationsLength',
    );
    expect(lastMutationsLength).toBe(4000);
  });

  it('should not record input values on selectively masked elements when maskAllInputs is disabled', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form-masked.html', {
        maskAllInputs: false,
        // XXX(sentry)
        // maskInputSelector: '.rr-mask',
      }),
    );

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('input[type="password"]', 'password');
    await page.type('textarea', 'textarea test');
    await page.select('select', '1');
    await page.type('#empty', 'test');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('correctly masks & unmasks attribute values', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'attributes-mask.html', {
        // XXX(sentry)
        // maskAllText: true,
        // unmaskTextSelector: '.rr-unmask',
      }),
    );

    // Change attributes, should still be masked
    await page.evaluate(() => {
      document
        .querySelectorAll('body [title]')
        .forEach((el) => el.setAttribute('title', 'new title'));
      document
        .querySelectorAll('body [aria-label]')
        .forEach((el) => el.setAttribute('aria-label', 'new aria label'));
      document
        .querySelectorAll('body [placeholder]')
        .forEach((el) => el.setAttribute('placeholder', 'new placeholder'));
      document
        .querySelectorAll('input[type="button"],input[type="submit"]')
        .forEach((el) => el.setAttribute('value', 'new value'));
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record input values if dynamically added and maskAllInputs is false', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'empty.html', { maskAllInputs: false }),
    );

    await page.evaluate(() => {
      const el = document.createElement('input');
      el.id = 'input';
      el.value = 'input should not be masked';

      const nextElement = document.querySelector('#one')!;
      nextElement.parentNode!.insertBefore(el, nextElement);
    });

    await page.type('#input', 'moo');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots.filter(isNotScroll));
  });

  it('should record textarea values if dynamically added and maskAllInputs is false', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'empty.html', { maskAllInputs: false }),
    );

    await page.evaluate(() => {
      const el = document.createElement('textarea');
      el.id = 'textarea';
      el.innerText = `textarea should not be masked
`;

      const nextElement = document.querySelector('#one')!;
      nextElement.parentNode!.insertBefore(el, nextElement);
    });

    await page.type('#textarea', 'moo');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots.filter(isNotScroll));
  });

  it('should record input values if dynamically added, maskAllInputs is false, and mask selector is used', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'empty.html', {
        maskAllInputs: false,
        // XXX(sentry)
        // maskInputSelector: '.rr-mask',
      }),
    );

    await page.evaluate(() => {
      const el = document.createElement('input');
      el.id = 'input-masked';
      el.className = 'rr-mask';
      el.value = 'input should be masked';

      const nextElement = document.querySelector('#one')!;
      nextElement.parentNode!.insertBefore(el, nextElement);
    });

    await page.type('#input-masked', 'moo');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots.filter(isNotScroll));
  });

  it('should not record textarea values if dynamically added and maskAllInputs is true', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'empty.html', { maskAllInputs: true }),
    );

    await page.evaluate(() => {
      const el = document.createElement('textarea');
      el.id = 'textarea';
      el.innerText = `textarea should be masked
`;

      const nextElement = document.querySelector('#one')!;
      nextElement.parentNode!.insertBefore(el, nextElement);
    });

    await page.type('#textarea', 'moo');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots.filter(isNotScroll));
  });

  it('should record input values if dynamically added, maskAllInputs is true, and unmask selector is used', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'empty.html', {
        maskAllInputs: true,
        // XXX(sentry)
        // unmaskInputSelector: '.rr-unmask',
      }),
    );

    await page.evaluate(() => {
      const el = document.createElement('input');
      el.id = 'input-unmasked';
      el.className = 'rr-unmask';
      el.value = 'input should be unmasked';

      const nextElement = document.querySelector('#one')!;
      nextElement.parentNode!.insertBefore(el, nextElement);
    });

    await page.type('#input-unmasked', 'moo');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots.filter(isNotScroll));
  });

  it('should always mask value attribute of passwords', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'password.html', {
        maskInputOptions: {},
      }),
    );

    await page.type('#password', 'secr3t');

    // Change type to text (simulate "show password")
    await page.click('#show-password');
    await page.type('#password', 'XY');
    await page.click('#show-password');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should mask text in form elements', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', {
        // XXX(sentry)
        // maskAllText: true
      }),
    );

    // Ensure also masked when we change stuff
    await page.evaluate(() => {
      document
        .querySelector('input[type="submit"]')
        ?.setAttribute('value', 'new value');
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should not record blocked elements from blockSelector, when dynamically added', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'block.html', {
        blockSelector: 'video',
      }),
    );

    await page.evaluate(() => {
      const el2 = document.createElement('video');
      el2.className = 'rr-block';
      el2.style.width = '100px';
      el2.style.height = '100px';
      const source2 = document.createElement('source');
      source2.src = 'file:///foo.mp4';
      // These aren't valid, but doing this for testing
      source2.style.width = '100px';
      source2.style.height = '100px';
      el2.appendChild(source2);

      const el = document.createElement('video');
      el.style.width = '100px';
      el.style.height = '100px';
      const source = document.createElement('source');
      source.src = 'file:///foo.mp4';
      // These aren't valid, but doing this for testing
      source.style.width = '100px';
      source.style.height = '100px';
      el.appendChild(source);

      const nextElement = document.querySelector('.rr-block')!;
      nextElement.parentNode!.insertBefore(el, nextElement);
      nextElement.parentNode!.insertBefore(el2, nextElement);
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should only record unblocked elements', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'block.html', {
        blockSelector: 'img,svg',
        // XXX(sentry)
        // unblockSelector: '.rr-unblock',
      }),
    );

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should mask only inputs', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mask-text.html', {
        maskAllInputs: true,
        // XXX(sentry)
        // maskAllText: false,
      }),
    );

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should mask all text (except unmaskTextSelector), using maskAllText ', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mask-text.html', {
        maskTextClass: 'none',
        // XXX(sentry)
        // maskAllText: true,
        // unmaskTextSelector: '.rr-unmask',
      }),
    );

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });
});
