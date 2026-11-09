import { EventType, IncrementalSource } from '@sentry/rrweb-types';
import type { eventWithTime } from '@sentry/rrweb-types';

const now = Date.now();

/**
 * Builds events where a constructed stylesheet is first adopted by a shadow
 * host that is later removed, then adopted by a second host using only its
 * styleId. Both hosts are appended to `parentId`, inside `rootId` if set.
 */
function buildHostEvents(
  parentId: number,
  firstId: number,
  rootId?: number,
): eventWithTime[] {
  const host = (hostId: number, name: string) => [
    {
      parentId,
      nextId: null,
      node: {
        type: 2,
        tagName: 'div',
        attributes: { id: name },
        childNodes: [],
        id: hostId,
        rootId,
      },
    },
    {
      parentId: hostId,
      nextId: null,
      node: {
        type: 2,
        tagName: 'span',
        attributes: {},
        childNodes: [],
        id: hostId + 1,
        isShadow: true,
        rootId,
      },
    },
  ];
  const host1 = firstId;
  const host2 = firstId + 2;

  return [
    // Add shadow host #1
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.Mutation,
        texts: [],
        attributes: [],
        removes: [],
        adds: host(host1, 'host1'),
      },
      timestamp: now + 200,
    },
    // Host #1 adopts stylesheet #1, which carries the rules
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.AdoptedStyleSheet,
        id: host1,
        styleIds: [1],
        styles: [{ rules: [{ rule: 'span { color: red; }' }], styleId: 1 }],
      },
      timestamp: now + 250,
    },
    // Remove host #1
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.Mutation,
        texts: [],
        attributes: [],
        removes: [{ parentId, id: host1 }],
        adds: [],
      },
      timestamp: now + 300,
    },
    // Add shadow host #2
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.Mutation,
        texts: [],
        attributes: [],
        removes: [],
        adds: host(host2, 'host2'),
      },
      timestamp: now + 350,
    },
    // Host #2 adopts stylesheet #1 by styleId only
    {
      type: EventType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.AdoptedStyleSheet,
        id: host2,
        styleIds: [1],
      },
      timestamp: now + 400,
    },
  ] as eventWithTime[];
}

/**
 * Builds the leading events with a full snapshot whose body holds `bodyChildNodes`.
 */
function buildSnapshot(bodyChildNodes: unknown[]): eventWithTime[] {
  return [
    { type: EventType.DomContentLoaded, data: {}, timestamp: now },
    {
      type: EventType.Meta,
      data: { href: 'about:blank', width: 1920, height: 1080 },
      timestamp: now + 100,
    },
    {
      type: EventType.FullSnapshot,
      data: {
        node: {
          type: 0,
          childNodes: [
            { type: 1, name: 'html', publicId: '', systemId: '', id: 2 },
            {
              type: 2,
              tagName: 'html',
              attributes: {},
              childNodes: [
                {
                  type: 2,
                  tagName: 'head',
                  attributes: {},
                  childNodes: [],
                  id: 4,
                },
                {
                  type: 2,
                  tagName: 'body',
                  attributes: {},
                  childNodes: bodyChildNodes,
                  id: 5,
                },
              ],
              id: 3,
            },
          ],
          id: 1,
        },
        initialOffset: { left: 0, top: 0 },
      },
      timestamp: now + 100,
    },
  ] as eventWithTime[];
}

const events: eventWithTime[] = [
  ...buildSnapshot([]),
  ...buildHostEvents(5, 6),
];

/**
 * Builds a rule insertion on stylesheet #1, `offset` ms after the recording starts.
 */
function buildRuleAdd(offset: number, rule: string): eventWithTime {
  return {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.StyleSheetRule,
      styleId: 1,
      adds: [{ rule }],
    },
    timestamp: now + offset,
  };
}

/**
 * Same as the default events, but stylesheet #1 also gets a rule while host #1
 * is attached, one after host #1 is removed, and one after host #2 is added.
 */
export const mutatedEvents: eventWithTime[] = [
  ...events,
  buildRuleAdd(270, 'span { --while-attached: 1; }'),
  buildRuleAdd(320, 'span { --while-orphaned: 1; }'),
  buildRuleAdd(370, 'span { --before-readopted: 1; }'),
].sort((a, b) => a.timestamp - b.timestamp);

/**
 * Same as the default events, but both hosts live inside a nested iframe.
 */
export const inIframeEvents: eventWithTime[] = [
  ...buildSnapshot([
    { type: 2, tagName: 'iframe', attributes: {}, childNodes: [], id: 6 },
  ]),
  // Attach the iframe document
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.Mutation,
      adds: [
        {
          parentId: 6,
          nextId: null,
          node: {
            type: 0,
            childNodes: [
              {
                type: 2,
                tagName: 'html',
                attributes: {},
                childNodes: [
                  {
                    type: 2,
                    tagName: 'head',
                    attributes: {},
                    childNodes: [],
                    rootId: 10,
                    id: 12,
                  },
                  {
                    type: 2,
                    tagName: 'body',
                    attributes: {},
                    childNodes: [],
                    rootId: 10,
                    id: 13,
                  },
                ],
                rootId: 10,
                id: 11,
              },
            ],
            compatMode: 'CSS1Compat',
            id: 10,
          },
        },
      ],
      removes: [],
      texts: [],
      attributes: [],
      isAttachIframe: true,
    },
    timestamp: now + 150,
  },
  ...buildHostEvents(13, 14, 10),
];

export default events;
