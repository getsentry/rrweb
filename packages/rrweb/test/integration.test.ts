import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as puppeteer from 'puppeteer';
import {
  assertSnapshot,
  startServer,
  getServerURL,
  launchPuppeteer,
  waitForRAF,
  replaceLast,
} from './utils';
import { recordOptions, eventWithTime, EventType, IncrementalSource } from '../src/types';
import { visitSnapshot, NodeType } from '@sentry-internal/rrweb-snapshot';

interface ISuite {
  server: http.Server;
  serverURL: string;
  code: string;
  browser: puppeteer.Browser;
}

interface IMimeType {
  [key: string]: string;
}

/**
 * Used to filter scroll events out of snapshots as they are flakey
 */
function isNotScroll(snapshot: eventWithTime) {
  return !(snapshot.type === EventType.IncrementalSnapshot && snapshot.data.source === IncrementalSource.Scroll)
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
      window.snapshots = [];
      rrweb.record({
        emit: event => {          
          window.snapshots.push(event);
        },
        maskTextSelector: ${JSON.stringify(options.maskTextSelector)},
        blockSelector: ${JSON.stringify(options.blockSelector)},
        maskAllInputs: ${options.maskAllInputs},
        maskInputOptions: ${JSON.stringify(options.maskAllInputs)},
        maskInputSelector: ${JSON.stringify(options.maskInputSelector)},
        userTriggeredOnInput: ${options.userTriggeredOnInput},
        onMutation: ${options.onMutation || undefined},
        maskAllText: ${options.maskAllText},
        maskTextFn: ${options.maskTextFn},
        unmaskTextSelector: ${JSON.stringify(options.unmaskTextSelector)},
        unmaskInputSelector: ${JSON.stringify(options.unmaskInputSelector)},
        blockSelector: ${JSON.stringify(options.blockSelector)},
        unblockSelector: ${JSON.stringify(options.unblockSelector)},
        recordCanvas: ${options.recordCanvas},
        plugins: ${options.plugins}        
      });
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

  it('can record form interactions', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'form.html'));

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('textarea', 'textarea test');
    await page.select('select', '1');

    const snapshots = await page.evaluate('window.snapshots');
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

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('handles null attribute values', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mutation-observer.html', {
        maskAllInputs: true,
        maskAllText: true,
      }),
    );

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

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('can record character data muatations', async () => {
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

    const snapshots = await page.evaluate('window.snapshots');
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

    const snapshots = await page.evaluate('window.snapshots');
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
    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('can configure onMutation', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');

    await page.setContent(
      getHtml.call(this, 'mutation-observer.html', { 
        onMutation: `(mutations) => { window.lastMutationsLength = mutations.length; return mutations.length < 500 }`
       }),
    );

    await page.evaluate(() => {
      const ul = document.querySelector('ul') as HTMLUListElement;

      for(let i = 0; i < 2000; i++) {
        const li = document.createElement('li');
        ul.appendChild(li);
        const p = document.querySelector('p') as HTMLParagraphElement;
        p.appendChild(document.createElement('span'));
      }
    });

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);

    const lastMutationsLength = await page.evaluate('window.lastMutationsLength');
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

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('should not record input events on ignored elements', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'ignore.html'));

    await page.type('.rr-ignore', 'secret');

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('should not record input values if maskAllInputs is enabled', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', {
        maskAllInputs: true,
        unmaskTextSelector: '.rr-unmask',
      }),
    );

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('input[type="password"]', 'password');
    await page.type('textarea', 'textarea test');
    await page.select('select', '1');
    await page.type('#empty', 'test');

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('should not record input values on selectively masked elements when maskAllInputs is disabled', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form-masked.html', {
        maskAllInputs: false,
        maskInputSelector: '.rr-mask',
      }),
    );

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('input[type="password"]', 'password');
    await page.type('textarea', 'textarea test');
    await page.select('select', '1');
    await page.type('#empty', 'test');

    const snapshots = await page.evaluate('window.snapshots');
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

    const snapshots = await page.evaluate('window.snapshots') as eventWithTime[];
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

    const snapshots = await page.evaluate('window.snapshots') as eventWithTime[];
    assertSnapshot(snapshots.filter(isNotScroll));
  });

  it('should record input values if dynamically added, maskAllInputs is false, and mask selector is used', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'empty.html', { maskAllInputs: false, maskInputSelector: '.rr-mask' }),
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

    const snapshots = await page.evaluate('window.snapshots') as eventWithTime[];
    assertSnapshot(snapshots.filter(isNotScroll));
  });

  it('should not record input values if dynamically added and maskAllInputs is true', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'empty.html', { maskAllInputs: true }),
    );

    await page.evaluate(() => {
      const el = document.createElement('input');
      el.id = 'input';
      el.value = 'input should be masked';

      const nextElement = document.querySelector('#one')!;
      nextElement.parentNode!.insertBefore(el, nextElement);
    });

    await page.type('#input', 'moo');

    const snapshots = await page.evaluate('window.snapshots') as eventWithTime[];
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

    const snapshots = await page.evaluate('window.snapshots') as eventWithTime[];
    assertSnapshot(snapshots.filter(isNotScroll));
  });

  it('should record input values if dynamically added, maskAllInputs is true, and unmask selector is used', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'empty.html', { maskAllInputs: true, unmaskInputSelector: '.rr-unmask'}),
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

    const snapshots = await page.evaluate('window.snapshots') as eventWithTime[];
    assertSnapshot(snapshots.filter(isNotScroll));
  });

  it('can use maskInputOptions to configure which type of inputs should be masked', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'form.html', {
        maskInputOptions: {
          text: false,
          textarea: false,
          password: true,
        },
      }),
    );

    await page.type('input[type="text"]', 'test');
    await page.click('input[type="radio"]');
    await page.click('input[type="checkbox"]');
    await page.type('textarea', 'textarea test');
    await page.type('input[type="password"]', 'password');
    await page.select('select', '1');

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('should mask value attribute with maskInputOptions', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'password.html', {
        maskInputOptions: {
          password: true,
        },
      }),
    );

    await page.type('input[type="password"]', 'secr3t');

    const snapshots = await page.evaluate('window.snapshots');
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

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('should not record blocked elements and its child nodes', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'block.html'));

    await page.type('input', 'should not be record');
    await page.evaluate(`document.getElementById('text').innerText = '1'`);
    await page.click('#text');

    const snapshots = await page.evaluate('window.snapshots');
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

      const nextElement = document.querySelector('.rr-block')!;
      nextElement.parentNode!.insertBefore(el, nextElement);
    });

    const snapshots = await page.evaluate('window.snapshots');
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

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('should only record unblocked elements', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'block.html', {
        blockSelector: 'img,svg',
        unblockSelector: '.rr-unblock',
      }),
    );

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
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
    const snapshots = await page.evaluate('window.snapshots');
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
    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('should record dynamic CSS changes', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'react-styled-components.html'));
    await page.click('.toggle');
    const snapshots = await page.evaluate('window.snapshots');
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

  it('should record webgl canvas mutations', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'canvas-webgl.html', {
        recordCanvas: true,
      }),
    );
    await page.waitForTimeout(50);
    const snapshots = await page.evaluate('window.snapshots');
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

    const snapshots = await page.evaluate('window.snapshots');
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

  it('should record console messages', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'log.html', {
        plugins: '[rrwebConsoleRecord.getRecordConsolePlugin()]',
      }),
    );

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

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('should nest record iframe', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto(`${serverURL}/html`);
    await page.setContent(getHtml.call(this, 'main.html'));

    await page.waitForSelector('#two');
    const frameIdTwo = await page.frames()[2];
    await frameIdTwo.waitForSelector('#four');
    const frameIdFour = frameIdTwo.childFrames()[1];
    await frameIdFour.waitForSelector('#five');

    await page.waitForTimeout(50);

    const snapshots = await page.evaluate('window.snapshots');
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

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('should record nested iframes and shadow doms', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(getHtml.call(this, 'frame2.html'));

    await page.evaluate(() => {
      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      let iframe: HTMLIFrameElement;
      sleep(10)
        .then(() => {
          // get contentDocument of iframe five
          const contentDocument1 = document.querySelector('iframe')!
            .contentDocument!;
          // create shadow dom #1
          contentDocument1.body.attachShadow({ mode: 'open' });
          contentDocument1.body.shadowRoot!.appendChild(
            document.createElement('div'),
          );
          const div = contentDocument1.body.shadowRoot!.childNodes[0];
          iframe = contentDocument1.createElement('iframe');
          // append an iframe to shadow dom #1
          div.appendChild(iframe);
          return sleep(10);
        })
        .then(() => {
          const contentDocument2 = iframe.contentDocument!;
          // create shadow dom #2 in the iframe
          contentDocument2.body.attachShadow({ mode: 'open' });
          contentDocument2.body.shadowRoot!.appendChild(
            document.createElement('span'),
          );
        });
    });
    await page.waitForTimeout(50);

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('should mask only inputs', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mask-text.html', {
        maskAllInputs: true,
        maskAllText: false,
      }),
    );

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });

  it('should mask all text (except unmaskTextSelector), using maskAllText ', async () => {
    const page: puppeteer.Page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(
      getHtml.call(this, 'mask-text.html', {
        maskTextClass: 'none',
        maskAllText: true,
        unmaskTextSelector: '.rr-unmask',
      }),
    );

    const snapshots = await page.evaluate('window.snapshots');
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

    const snapshots = await page.evaluate('window.snapshots');
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

    const snapshots = await page.evaluate('window.snapshots');
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

    const snapshots = await page.evaluate('window.snapshots');
    assertSnapshot(snapshots);
  });
});
