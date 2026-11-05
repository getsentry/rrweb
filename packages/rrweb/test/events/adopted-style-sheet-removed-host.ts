import { EventType, IncrementalSource } from '@sentry/rrweb-types';
import type { eventWithTime } from '@sentry/rrweb-types';

const now = Date.now();

/**
 * A constructed stylesheet is first adopted by a shadow host that is later
 * removed, then adopted by a second host using only its styleId.
 */
const events: eventWithTime[] = [
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
                childNodes: [],
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
  // Add shadow host #1
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.Mutation,
      texts: [],
      attributes: [],
      removes: [],
      adds: [
        {
          parentId: 5,
          nextId: null,
          node: {
            type: 2,
            tagName: 'div',
            attributes: { id: 'host1' },
            childNodes: [],
            id: 6,
          },
        },
        {
          parentId: 6,
          nextId: null,
          node: {
            type: 2,
            tagName: 'span',
            attributes: {},
            childNodes: [],
            id: 7,
            isShadow: true,
          },
        },
      ],
    },
    timestamp: now + 200,
  },
  // Host #1 adopts stylesheet #1, which carries the rules
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.AdoptedStyleSheet,
      id: 6,
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
      removes: [{ parentId: 5, id: 6 }],
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
      adds: [
        {
          parentId: 5,
          nextId: null,
          node: {
            type: 2,
            tagName: 'div',
            attributes: { id: 'host2' },
            childNodes: [],
            id: 8,
          },
        },
        {
          parentId: 8,
          nextId: null,
          node: {
            type: 2,
            tagName: 'span',
            attributes: {},
            childNodes: [],
            id: 9,
            isShadow: true,
          },
        },
      ],
    },
    timestamp: now + 350,
  },
  // Host #2 adopts stylesheet #1 by styleId only
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.AdoptedStyleSheet,
      id: 8,
      styleIds: [1],
    },
    timestamp: now + 400,
  },
];

export default events;
