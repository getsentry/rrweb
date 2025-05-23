import * as fs from 'fs';
import * as path from 'path';
import type * as puppeteer from 'puppeteer';
import { vi } from 'vitest';
import {
  assertSnapshot,
  startServer,
  getServerURL,
  launchPuppeteer,
  waitForRAF,
  waitForIFrameLoad,
  replaceLast,
  generateRecordSnippet,
  ISuite,
  stripBase64,
} from './utils';
import type { recordOptions } from '../src/types';
import {
  eventWithTime,
  EventType,
  RecordPlugin,
  IncrementalSource,
  CanvasContext,
} from '@sentry-internal/rrweb-types';
import { visitSnapshot, NodeType } from '@sentry-internal/rrweb-snapshot';

describe('record integration tests', function (this: ISuite) {
  vi.setConfig({ testTimeout: 10_000 });

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

    const bundlePath = path.resolve(__dirname, '../dist/rrweb.umd.cjs');
    code = fs.readFileSync(bundlePath, 'utf8');
  });

  afterAll(async () => {
    await browser.close();
    server.close();
  });

  it('can record clicks', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'link.html'));
    await page.click('span');

    // also tap on the span
    const span = await page.waitForSelector('span');
    const center = await page.evaluate((el) => {
      const { x, y, width, height } = el!.getBoundingClientRect();
      return {
        x: Math.round(x + width / 2),
        y: Math.round(y + height / 2),
      };
    }, span);
    await page.touchscreen.tap(center.x, center.y);

    await page.click('a');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('can record form interactions', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'form.html'));

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('textarea', 'textarea test');
    await page.select('select', '1');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('can record childList mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'mutation-observer.html'));

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      ul.appendChild(li);
      document.body.removeChild(ul);
      const p = document.querySelector('p') as HTMLParagraphElement;
      p.appendChild(document.createElement('span'));
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('can record character data mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'mutation-observer.html'));

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      ul.appendChild(li);
      li.innerText = 'new list item';
      li.innerText = 'new list item edit';
      document.body.removeChild(ul);
      const p = document.querySelector('p') as HTMLParagraphElement;
      p.innerText = 'mutated';
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('can record attribute mutation', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'mutation-observer.html'));

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      ul.appendChild(li);
      li.setAttribute('foo', 'bar');
      document.body.removeChild(ul);
      document.body.setAttribute('test', 'true');
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('can mask attribute on mutation', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mutation-observer.html', {
        maskAttributeFn: (key: string, value: string) => {
          if (key === 'placeholder') {
            return value.replace(/[\S]/g, '*');
          }

          return value;
        },
      }),
    );

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      ul.appendChild(li);
      li.setAttribute('placeholder', 'placeholder');
      li.setAttribute('title', 'title');
      document.body.removeChild(ul);
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('handles null attribute values', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'mutation-observer.html', {}));

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      ul.appendChild(li);

      li.setAttribute('aria-label', 'label');
      li.setAttribute('id', 'test-li');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    await page.evaluate(() => {
      const li = document.querySelector('#test-li') as HTMLLIElement;
      // This triggers the mutation observer with a `null` attribute value
      li.removeAttribute('aria-label');
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('can record node mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'select2.html'), {
      waitUntil: 'networkidle0',
    });

    // toggle the select box
    await page.click('.select2-container', { clickCount: 2, delay: 100 });
    // test storage of !important style
    await page.evaluate(
      'document.getElementById("select2-drop").setAttribute("style", document.getElementById("select2-drop").style.cssText + "color:black !important")',
    );
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('can record style changes compactly and preserve css var() functions', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'blank.html'), {
      waitUntil: 'networkidle0',
    });

    // goal here is to ensure var(--mystery) ends up in the mutations (CSSOM fails in this case)
    await page.evaluate(
      'document.body.setAttribute("style", "background: var(--mystery)")',
    );
    await waitForRAF(page);
    // and in this change we can't use the shorter styleObj format either
    await page.evaluate(
      'document.body.setAttribute("style", "background: var(--mystery); background-color: black")',
    );

    // reset is always shorter to be recorded as a sting rather than a styleObj
    await page.evaluate('document.body.setAttribute("style", "")');
    await waitForRAF(page);

    await page.evaluate('document.body.setAttribute("style", "display:block")');
    await waitForRAF(page);
    // following should be recorded as an update of `{ color: 'var(--mystery-color)' }` without needing to include the display
    await page.evaluate(
      'document.body.setAttribute("style", "color:var(--mystery-color);display:block")',
    );
    await waitForRAF(page);
    // whereas this case, it's shorter to record the entire string than the longhands for margin
    await page.evaluate(
      'document.body.setAttribute("style", "color:var(--mystery-color);display:block;margin:10px")',
    );
    await waitForRAF(page);
    // and in this case, it's shorter to record just the change to the longhand margin-left;
    await page.evaluate(
      'document.body.setAttribute("style", "color:var(--mystery-color);display:block;margin:10px 10px 10px 0px;")',
    );
    await waitForRAF(page);
    // see what happens when we manipulate the style object directly (expecting a compact mutation with just these two changes)
    await page.evaluate(
      'document.body.style.marginTop = 0; document.body.style.color = null',
    );
    await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('can configure onMutation', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');

    await page.setContent(
      getHtml.call(this, 'mutation-observer.html', {
        // @ts-expect-error Need to stringify this for tests
        onMutation: `(mutations) => { window.lastMutationsLength = mutations.length; return mutations.length < 500 }`,
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

    await assertSnapshot(page);

    const lastMutationsLength = await page.evaluate(
      'window.lastMutationsLength',
    );
    expect(lastMutationsLength).toBe(4000);
  });

  it('can freeze mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mutation-observer.html', { recordCanvas: true }),
    );

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      ul.appendChild(li);
      li.setAttribute('foo', 'bar');
      document.body.setAttribute('test', 'true');
    });
    await page.evaluate('rrweb.freezePage()');
    await page.evaluate(() => {
      document.body.setAttribute('test', 'bad');
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const gl = canvas.getContext('webgl') as WebGLRenderingContext;
      gl.getExtension('bad');
      const ul = document.querySelector('ul') as HTMLUListElement;
      const li = document.createElement('li');
      li.setAttribute('bad-attr', 'bad');
      li.innerText = 'bad text';
      ul.appendChild(li);
      document.body.removeChild(ul);
    });

    await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should not record input events on ignored elements', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'ignore.html', {
        ignoreSelector: '[data-rr-ignore]',
      }),
    );

    await page.type('.rr-ignore', 'secret');
    await page.type('[data-rr-ignore]', 'secret');
    await page.type('.dont-ignore', 'not secret');

    await assertSnapshot(page);
  });

  it('should not record input values if maskAllInputs is enabled', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', { maskAllInputs: true }),
    );

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('input[type="password"]', 'password');
    await page.type('textarea', 'textarea test');
    await page.select('select', '1');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should not record input values for inputs we enforce', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'blank.html'));

    // Dynamically add elements to page
    await page.evaluate(() => {
      const autocompleteValues = [
        'current-password',
        'new-password',
        'cc-number',
        'cc-exp',
        'cc-exp-month',
        'cc-exp-year',
        'cc-csc',
      ];
      const parent = document.body;
      autocompleteValues.forEach((autocomplete) => {
        const el = document.createElement('input');
        el.setAttribute('autocomplete', autocomplete);
        el.value = 'initial value';
        parent.appendChild(el);
      });

      // this one is allowed
      const el = document.createElement('input');
      el.setAttribute('autocomplete', 'name');
      el.value = 'allowed value';
      parent.appendChild(el);
    });

    await page.type('input[autocomplete="current-password"]', 'new');
    await page.type('input[autocomplete="new-password"]', 'new');
    await page.type('input[autocomplete="cc-number"]', 'new');
    await page.type('input[autocomplete="cc-exp"]', 'new');
    await page.type('input[autocomplete="cc-exp-month"]', 'new');
    await page.type('input[autocomplete="cc-exp-year"]', 'new');
    await page.type('input[autocomplete="cc-csc"]', 'new');
    await page.type('input[autocomplete="name"]', 'allowed');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('can use maskInputOptions to configure which type of inputs should be masked', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', {
        maskInputOptions: {
          text: false,
          textarea: false,
          color: true,
        },
      }),
    );

    await page.type('input[type="text"]', 'test');
    await page.type('input[type="color"]', '#FF0000');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('textarea', 'textarea test');
    await page.type('input[type="password"]', 'password');
    await page.select('select', '1');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('can use maskTextSelector to configure which inputs should be masked', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', {
        maskTextSelector: 'input[type="text"],textarea',
        maskInputFn: () => '*'.repeat(10),
      }),
    );

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('textarea', 'textarea test');
    await page.type('input[type="password"]', 'password');
    await page.select('select', '1');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should mask password value attribute with maskInputOptions', async () => {
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

  it('should mask inputs via function call', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', {
        maskAllInputs: true,
        maskInputFn: (text: string, element: HTMLElement) => {
          // If the element has the attribute "data-unmask-example", we don't mask it
          if (element.hasAttribute('data-unmask-example')) {
            return text;
          }

          return '*'.repeat(text.length);
        },
      }),
    );

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('input[type="password"]', 'password');
    await page.type('textarea', 'textarea test');
    await page.select('select', '1');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should mask attribute via function call', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', {
        maskAttributeFn: (key: string, value: string) => {
          if (key === 'placeholder') {
            return value.replace(/[\S]/g, '*');
          }
          return value;
        },
      }),
    );

    await page.type('input[type="text"]', 'test');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record input userTriggered values if userTriggeredOnInput is enabled', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', { userTriggeredOnInput: true }),
    );

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('input[type="password"]', 'password');
    await page.type('textarea', 'textarea test');
    await page.select('select', '1');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should not record blocked elements and its child nodes', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'block.html'));

    await page.type('input', 'should not be record');
    await page.evaluate(`document.getElementById('text').innerText = '1'`);
    await page.click('#text');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record unblocked elements that are also blocked more generically', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    const html = getHtml.call(this, 'unblock.html', {
      blockSelector: 'div',
      unblockSelector: '.rr-unblock',
    });
    await page.setContent(html);

    await page.type('input', 'should be record');
    await page.evaluate(`document.getElementById('text').innerText = '1'`);
    await page.click('#text');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should not record blocked elements dynamically added', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'block.html'));

    await page.evaluate(() => {
      const el = document.createElement('button');
      el.className = 'rr-block';
      el.style.width = '100px';
      el.style.height = '100px';
      el.innerText = 'Should not be recorded';

      const iframe = document.createElement('iframe');
      iframe.className = 'rr-block';
      iframe.style.width = '100px';
      iframe.style.height = '100px';
      iframe.src = '#foo';

      const nextElement = document.querySelector('.rr-block')!;
      nextElement.parentNode!.insertBefore(el, nextElement);
      nextElement.parentNode!.insertBefore(iframe, nextElement);
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('mutations should work when blocked class is unblocked', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about: blank');
    await page.setContent(
      getHtml.call(this, 'blocked-unblocked.html', {
        blockSelector: 'p',
        unblockSelector: '.visible3,.rr-unblock',
      }),
    );

    const elements1 = (await page.$x(
      '/html/body/div[1]/button',
    )) as puppeteer.ElementHandle<HTMLButtonElement>[];
    await elements1[0].click();

    const elements2 = (await page.$x(
      '/html/body/div[2]/button',
    )) as puppeteer.ElementHandle<HTMLButtonElement>[];
    await elements2[0].click();

    const elements3 = (await page.$x(
      '/html/body/div[3]/button',
    )) as puppeteer.ElementHandle<HTMLButtonElement>[];
    await elements3[0].click();

    await assertSnapshot(page);
  });

  it('should record DOM node movement 1', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'move-node.html'));

    await page.evaluate(() => {
      const div = document.querySelector('div')!;
      const p = document.querySelector('p')!;
      const span = document.querySelector('span')!;
      document.body.removeChild(span);
      p.appendChild(span);
      p.removeChild(span);
      div.appendChild(span);
    });
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record DOM node movement 2', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'move-node.html'));

    await page.evaluate(() => {
      const div = document.createElement('div');
      const span = document.querySelector('span')!;
      document.body.appendChild(div);
      div.appendChild(span);
    });
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record dynamic CSS changes', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'react-styled-components.html'));
    await page.click('.toggle');
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record canvas mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'canvas.html', {
        recordCanvas: true,
      }),
    );
    await page.waitForFunction('window.canvasMutationApplied');
    await waitForRAF(page);
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    for (const event of snapshots) {
      if (event.type === EventType.FullSnapshot) {
        visitSnapshot(event.data.node, (n) => {
          if (n.type === NodeType.Element && n.attributes.rr_dataURL) {
            n.attributes.rr_dataURL = `LOOKS LIKE WE COULD NOT GET STABLE BASE64 FROM SAME IMAGE.`;
          }
        });
      }
    }
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

    await assertSnapshot(page);
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

    await assertSnapshot(page);
  });

  it('should not record input values if dynamically added, maskAllInputs is false, and mask selector is used', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'empty.html', {
        maskAllInputs: false,
        maskTextSelector: '.rr-mask',
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

    await assertSnapshot(page);
  });

  it('should not record input values if dynamically added and maskAllInputs is true', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'empty.html', { maskAllInputs: true }),
    );

    await page.evaluate(() => {
      const el = document.createElement('input');
      el.size = 50;
      el.id = 'input';
      el.value = 'input should be masked';

      const nextElement = document.querySelector('#one')!;
      nextElement.parentNode!.insertBefore(el, nextElement);
    });

    await page.type('#input', 'moo');

    await assertSnapshot(page);
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

    await assertSnapshot(page);
  });

  it('should record input values if dynamically added, maskAllInputs is true, and unmask selector is used', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'empty.html', {
        maskAllInputs: true,
        unmaskTextSelector: '.rr-unmask',
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

    await assertSnapshot(page);
  });

  it('should record webgl canvas mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'canvas-webgl.html', {
        recordCanvas: true,
      }),
    );
    await page.waitForTimeout(50);
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('can correctly serialize a shader and multiple webgl contexts', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'canvas-webgl-shader.html', {
        recordCanvas: true,
      }),
    );
    await waitForRAF(page);
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('will serialize node before record', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'mutation-observer.html'));

    await page.evaluate(() => {
      const ul = document.querySelector('ul') as HTMLUListElement;
      let count = 3;
      while (count > 0) {
        count--;
        const li = document.createElement('li');
        ul.appendChild(li);
      }
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('will defer missing next node mutation', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'shuffle.html'));

    const text = await page.evaluate(() => {
      const els = Array.prototype.slice.call(document.querySelectorAll('li'));
      const parent = document.querySelector('ul')!;
      parent.removeChild(els[3]);
      parent.removeChild(els[2]);
      parent.removeChild(els[1]);
      parent.removeChild(els[0]);
      parent.insertBefore(els[3], els[4]);
      parent.insertBefore(els[2], els[4]);
      parent.insertBefore(els[1], els[4]);
      parent.insertBefore(els[0], els[4]);
      return parent.innerText;
    });

    expect(text).toEqual('4\n3\n2\n1\n5');
  });

  it('should nest record iframe', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto(`${serverURL}/html`);
    await page.setContent(getHtml.call(this, 'main.html'));

    const frameIdTwo = await waitForIFrameLoad(page, '#two');
    const frameIdFour = await waitForIFrameLoad(frameIdTwo, '#four');
    await waitForIFrameLoad(frameIdFour, '#five');

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  describe('canvas', function (this: ISuite) {
    vi.setConfig({ testTimeout: 10_000 });
    it('should record canvas within iframe', async () => {
      const page: puppeteer.Page = await browser.newPage();
      await page.goto(`${serverURL}/html`);
      await page.setContent(
        getHtml.call(this, 'canvas-iframe.html', {
          recordCanvas: true,
        }),
      );

      const frameId = await waitForIFrameLoad(page, '#iframe-canvas');
      await frameId.waitForFunction('window.canvasMutationApplied');
      await waitForRAF(page);

      const snapshots = (await page.evaluate(
        'window.snapshots',
      )) as eventWithTime[];
      expect(snapshots[snapshots.length - 1].data).toEqual(
        expect.objectContaining({
          source: IncrementalSource.CanvasMutation,
          type: CanvasContext['2D'],
          commands: expect.arrayContaining([
            {
              args: [200, 100],
              property: 'lineTo',
            },
          ]),
        }),
      );
      assertSnapshot(stripBase64(snapshots));
    });

    it('should record canvas within iframe with sampling', async () => {
      const maxFPS = 60;
      const page: puppeteer.Page = await browser.newPage();
      await page.goto(`${serverURL}/html`);
      await page.setContent(
        getHtml.call(this, 'canvas-iframe.html', {
          recordCanvas: true,
          sampling: {
            canvas: maxFPS,
          },
        }),
      );

      const frameId = await waitForIFrameLoad(page, '#iframe-canvas');
      await frameId.waitForFunction('window.canvasMutationApplied');
      await waitForRAF(page);
      await page.waitForTimeout(1000 / maxFPS);

      const snapshots = (await page.evaluate(
        'window.snapshots',
      )) as eventWithTime[];
      expect(snapshots[snapshots.length - 1].data).toEqual(
        expect.objectContaining({
          source: IncrementalSource.CanvasMutation,
          type: CanvasContext['2D'],
          commands: expect.arrayContaining([
            expect.objectContaining({
              property: 'drawImage',
            }),
          ]),
        }),
      );
    });

    it('should record canvas within shadow dom', async () => {
      const page: puppeteer.Page = await browser.newPage();
      await page.goto(`${serverURL}/html`);
      await page.setContent(
        getHtml.call(this, 'canvas-shadow-dom.html', {
          recordCanvas: true,
        }),
      );

      await page.waitForFunction('window.canvasMutationApplied');
      await waitForRAF(page);

      const snapshots = (await page.evaluate(
        'window.snapshots',
      )) as eventWithTime[];
      expect(snapshots[snapshots.length - 1].data).toEqual(
        expect.objectContaining({
          source: IncrementalSource.CanvasMutation,
          type: CanvasContext['2D'],
          commands: expect.arrayContaining([
            {
              args: [100, 100, 50, 50],
              property: 'fillRect',
            },
          ]),
        }),
      );
      assertSnapshot(stripBase64(snapshots));
    });

    it('should record canvas within shadow dom with sampling', async () => {
      const page: puppeteer.Page = await browser.newPage();
      await page.goto(`${serverURL}/html`);
      await page.setContent(
        getHtml.call(this, 'canvas-shadow-dom.html', {
          recordCanvas: true,
          sampling: {
            canvas: 60,
          },
        }),
      );

      await page.waitForFunction('window.canvasMutationApplied');
      await waitForRAF(page);

      await page.waitForTimeout(50);

      const snapshots = (await page.evaluate(
        'window.snapshots',
      )) as eventWithTime[];
      expect(snapshots[snapshots.length - 1].data).toEqual(
        expect.objectContaining({
          source: IncrementalSource.CanvasMutation,
          type: CanvasContext['2D'],
          commands: expect.arrayContaining([
            expect.objectContaining({
              property: 'drawImage',
            }),
          ]),
        }),
      );
      assertSnapshot(stripBase64(snapshots));
    });
  });

  it('should record images with blob url', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto(`${serverURL}/html`);
    page.setContent(
      getHtml.call(this, 'image-blob-url.html', { inlineImages: true }),
    );
    await page.waitForResponse(`${serverURL}/html/assets/robot.png`);
    await page.waitForSelector('img'); // wait for image to get added
    await waitForRAF(page); // wait for image to be captured

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record images inside iframe with blob url', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto(`${serverURL}/html`);
    await page.setContent(
      getHtml.call(this, 'frame-image-blob-url.html', { inlineImages: true }),
    );
    await page.waitForResponse(`${serverURL}/html/assets/robot.png`);
    await page.waitForTimeout(50); // wait for image to get added
    await waitForRAF(page); // wait for image to be captured

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record images inside iframe with blob url after iframe was reloaded', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto(`${serverURL}/html`);
    await page.setContent(
      getHtml.call(this, 'frame2.html', { inlineImages: true }),
    );
    await page.waitForSelector('iframe'); // wait for iframe to get added
    await waitForRAF(page); // wait for iframe to load
    page.evaluate(() => {
      const iframe = document.querySelector('iframe')!;
      iframe.setAttribute('src', '/html/image-blob-url.html');
    });
    await page.waitForResponse(`${serverURL}/html/assets/robot.png`); // wait for image to get loaded
    await page.waitForTimeout(50); // wait for image to get added
    await waitForRAF(page); // wait for image to be captured

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record shadow DOM', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'shadow-dom.html'));

    await page.evaluate(() => {
      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      const el = document.querySelector('.my-element') as HTMLDivElement;
      const shadowRoot = el.shadowRoot as ShadowRoot;
      shadowRoot.appendChild(document.createElement('span'));
      shadowRoot.appendChild(document.createElement('p'));
      sleep(1)
        .then(() => {
          shadowRoot.lastChild!.appendChild(document.createElement('p'));
          return sleep(1);
        })
        .then(() => {
          const firstP = shadowRoot.querySelector('p') as HTMLParagraphElement;
          shadowRoot.removeChild(firstP);
          return sleep(1);
        })
        .then(() => {
          (shadowRoot.lastChild!.childNodes[0] as HTMLElement).innerText = 'hi';
          return sleep(1);
        })
        .then(() => {
          (shadowRoot.lastChild!.childNodes[0] as HTMLElement).innerText =
            '123';
          const nestedShadowElement = shadowRoot.lastChild!
            .childNodes[0] as HTMLElement;
          nestedShadowElement.attachShadow({
            mode: 'open',
          });
          nestedShadowElement.shadowRoot!.appendChild(
            document.createElement('span'),
          );
          (nestedShadowElement.shadowRoot!.lastChild as HTMLElement).innerText =
            'nested shadow dom';
        });
    });
    await page.waitForTimeout(50);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record shadow DOM 2', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'blank.html'));
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const el = document.createElement('div') as HTMLDivElement;
        el.attachShadow({ mode: 'open' });
        (el.shadowRoot as ShadowRoot).appendChild(
          document.createElement('input'),
        );
        setTimeout(() => {
          document.body.append(el);
          resolve(null);
        }, 10);
      });
    });
    await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record shadow DOM 3', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'blank.html'));

    await page.evaluate(() => {
      const el = document.createElement('div') as HTMLDivElement;
      el.attachShadow({ mode: 'open' });
      (el.shadowRoot as ShadowRoot).appendChild(
        document.createElement('input'),
      );
      document.body.append(el);
    });
    await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record moved shadow DOM', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'blank.html'));

    await page.evaluate(() => {
      return new Promise((resolve) => {
        const el = document.createElement('div') as HTMLDivElement;
        el.attachShadow({ mode: 'open' });
        (el.shadowRoot as ShadowRoot).appendChild(
          document.createElement('input'),
        );
        document.body.append(el);
        setTimeout(() => {
          const newEl = document.createElement('div') as HTMLDivElement;
          document.body.append(newEl);
          newEl.append(el);
          resolve(null);
        }, 50);
      });
    });
    await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record moved shadow DOM 2', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'blank.html'));

    await page.evaluate(() => {
      const el = document.createElement('div') as HTMLDivElement;
      el.id = 'el';
      el.attachShadow({ mode: 'open' });
      (el.shadowRoot as ShadowRoot).appendChild(
        document.createElement('input'),
      );
      document.body.append(el);
      (el.shadowRoot as ShadowRoot).appendChild(document.createElement('span'));
      (el.shadowRoot as ShadowRoot).appendChild(document.createElement('p'));
      const newEl = document.createElement('div') as HTMLDivElement;
      newEl.id = 'newEl';
      document.body.append(newEl);
      newEl.append(el);
      const input = el.shadowRoot?.children[0] as HTMLInputElement;
      const span = el.shadowRoot?.children[1] as HTMLSpanElement;
      const p = el.shadowRoot?.children[2] as HTMLParagraphElement;
      input.remove();
      span.append(input);
      p.append(input);
      span.append(input);
      setTimeout(() => {
        p.append(input);
      }, 0);
    });
    await waitForRAF(page);

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record nested iframes and shadow doms', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'frame2.html'));

    await page.waitForSelector('iframe'); // wait for iframe to get added
    await waitForRAF(page); // wait till browser loaded contents of frame

    await page.evaluate(() => {
      // get contentDocument of iframe five
      const contentDocument1 =
        document.querySelector('iframe')!.contentDocument!;
      // create shadow dom #1
      contentDocument1.body.attachShadow({ mode: 'open' });
      contentDocument1.body.shadowRoot!.appendChild(
        document.createElement('div'),
      );
      const div = contentDocument1.body.shadowRoot!.childNodes[0];
      const iframe = contentDocument1.createElement('iframe');
      // append an iframe to shadow dom #1
      div.appendChild(iframe);
    });

    await waitForRAF(page); // wait till browser loaded contents of frame

    page.evaluate(() => {
      const iframe: HTMLIFrameElement = document
        .querySelector('iframe')!
        .contentDocument!.body.shadowRoot!.querySelector('iframe')!;

      const contentDocument2 = iframe.contentDocument!;
      // create shadow dom #2 in the iframe
      contentDocument2.body.attachShadow({ mode: 'open' });
      contentDocument2.body.shadowRoot!.appendChild(
        document.createElement('span'),
      );
    });
    await waitForRAF(page); // wait till browser sent snapshots

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record mutations in iframes across pages', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto(`${serverURL}/html`);
    await page.setContent(getHtml.call(this, 'frame2.html'));

    await page.waitForSelector('iframe'); // wait for iframe to get added
    await waitForRAF(page); // wait for iframe to load

    page.evaluate((serverURL) => {
      const iframe = document.querySelector('iframe')!;
      iframe.setAttribute('src', `${serverURL}/html`); // load new page
    }, serverURL);

    await page.waitForResponse(`${serverURL}/html`); // wait for iframe to load pt1
    await waitForRAF(page); // wait for iframe to load pt2

    await page.evaluate(() => {
      const iframeDocument = document.querySelector('iframe')!.contentDocument!;
      const div = iframeDocument.createElement('div');
      iframeDocument.body.appendChild(div);
    });

    await waitForRAF(page); // wait for snapshot to be updated
    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  // https://github.com/webcomponents/polyfills/tree/master/packages/shadydom
  it('should record shadow doms polyfilled by shadydom', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      // insert shadydom script
      replaceLast(
        getHtml.call(this, 'polyfilled-shadowdom-mutation.html'),
        '<head>',
        `
        <head>
        <script>
          // To force ShadyDOM to be used even when native ShadowDOM is available, set the ShadyDOM = {force: true} in a script prior to loading the polyfill.
          window.ShadyDOM = { force: true };
        </script>
        <script src="https://cdn.jsdelivr.net/npm/@webcomponents/shadydom@1.9.0/shadydom.min.js"></script>
    `,
      ),
    );
    await page.evaluate(() => {
      const target3 = document.querySelector('#target3');
      target3?.attachShadow({
        mode: 'open',
      });
      target3?.shadowRoot?.appendChild(document.createElement('span'));
    });
    await waitForRAF(page); // wait till browser sent snapshots

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  // https://github.com/salesforce/lwc/tree/master/packages/%40lwc/synthetic-shadow
  it('should record shadow doms polyfilled by synthetic-shadow', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      // insert lwc's synthetic-shadow script
      replaceLast(
        getHtml.call(this, 'polyfilled-shadowdom-mutation.html'),
        '<head>',
        `
        <head>
        <script>var process = {env: {NODE_ENV: "production"}};</script>
        <script src="https://cdn.jsdelivr.net/npm/@lwc/synthetic-shadow@2.20.3/dist/synthetic-shadow.js"></script>
      `,
      ),
    );
    await page.evaluate(() => {
      const target3 = document.querySelector('#target3');
      // create a shadow dom with synthetic shadow
      // https://github.com/salesforce/lwc/blob/v2.20.3/packages/@lwc/synthetic-shadow/src/faux-shadow/element.ts#L81-L87
      target3?.attachShadow({
        mode: 'open',
        '$$lwc-synthetic-mode': true,
      } as ShadowRootInit);
      target3?.shadowRoot?.appendChild(document.createElement('span'));
      const target4 = document.createElement('div');
      target4.id = 'target4';
      // create a native shadow dom
      document.body.appendChild(target4);
      target4.attachShadow({
        mode: 'open',
      });
      target4.shadowRoot?.appendChild(document.createElement('ul'));
    });
    await waitForRAF(page); // wait till browser sent snapshots

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should mask texts', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mask-text.html', {
        maskTextSelector: '[data-masking="true"]',
      }),
    );

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should mask texts using maskTextFn', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mask-text.html', {
        maskTextSelector: '[data-masking="true"]',
        maskTextFn: (t: string) => t.replace(/[a-z]/g, '*'),
      }),
    );

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should unmask texts using maskTextFn', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mask-text.html', {
        maskTextSelector: '*',
        maskTextFn: (t: string, el: HTMLElement) => {
          return el.matches('[data-unmask-example="true"]')
            ? t
            : t.replace(/[a-z]/g, '*');
        },
      }),
    );

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should mask texts using maskAllText', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mask-text.html', {
        maskAllText: true,
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
        maskAllText: false,
        maskAllInputs: true,
      }),
    );

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should not mask inputs when maskAllText:true and maskAllInputs:false', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', {
        maskAllText: true,
        maskAllInputs: false,
      }),
    );

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('can mask character data mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'mutation-observer.html'));

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      const p = document.querySelector('p') as HTMLParagraphElement;
      [li, p].forEach((element) => {
        element.className = 'rr-mask';
      });
      ul.appendChild(li);
      li.innerText = 'new list item';
      p.innerText = 'mutated';
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('can selectively unmask parts of the page', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'unmask-text.html', {
        maskAllText: true,
        maskTextSelector: '[data-masking="true"]',
        unmaskTextSelector: '[data-masking="false"]',
      }),
    );

    await page.evaluate(() => {
      const li = document.createElement('li');
      const ul = document.querySelector('ul') as HTMLUListElement;
      li.className = 'rr-mask';
      ul.appendChild(li);
      li.innerText = 'new list item';
    });

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });

  it('should record after DOMContentLoaded event', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'blank.html', {
        recordAfter: 'DOMContentLoaded',
      }),
    );

    const snapshots = (await page.evaluate(
      'window.snapshots',
    )) as eventWithTime[];
    assertSnapshot(snapshots);
  });
});
