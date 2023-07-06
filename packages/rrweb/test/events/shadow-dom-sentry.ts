import { EventType, eventWithTime, IncrementalSource } from '@rrweb/types';

const now = Date.now();

const events: eventWithTime[] = [
  { type: EventType.DomContentLoaded, data: {}, timestamp: now },
  { type: EventType.Load, data: {}, timestamp: now + 100 },
  {
    type: EventType.Meta,
    data: { href: 'https://localhost', width: 655, height: 846 },
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
            attributes: { lang: 'EN' },
            childNodes: [
              {
                type: 2,
                tagName: 'head',
                attributes: {},
                childNodes: [
                  {
                    type: 2,
                    tagName: 'meta',
                    attributes: { charset: 'utf-8' },
                    childNodes: [],
                    id: 5,
                  },
                ],
                id: 4,
              },
              {
                type: 2,
                tagName: 'body',
                attributes: {},
                childNodes: [
                  {
                    type: 2,
                    tagName: 'editable-list',
                    attributes: {
                      title: 'TODO',
                      'list-item-0': 'First item on the list',
                      'list-item-1': 'Second item on the list',
                      'list-item-2': 'Third item on the list',
                      'list-item-3': 'Fourth item on the list',
                      'list-item-4': 'Fifth item on the list',
                      listitem: 'This will not appear',
                      'add-item-text': 'Add new list item:',
                    },
                    childNodes: [],
                    id: 12,
                    isShadowHost: true,
                  },
                ],
                id: 10,
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
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.Mutation,
      texts: [],
      attributes: [],
      removes: [],
      adds: [
        {
          parentId: 12,
          nextId: null,
          node: {
            type: 2,
            tagName: 'div',
            attributes: { class: 'editable-list' },
            childNodes: [],
            id: 14,
            isShadow: true,
          },
        },
        {
          parentId: 14,
          nextId: 21,
          node: {
            type: 2,
            tagName: 'h3',
            attributes: {},
            childNodes: [],
            id: 19,
          },
        },
        {
          parentId: 19,
          nextId: null,
          node: { type: 3, textContent: 'TODO', id: 20 },
        },
        {
          parentId: 14,
          nextId: 22,
          node: { type: 3, textContent: '\n        ', id: 21 },
        },
        {
          parentId: 14,
          nextId: 54,
          node: {
            type: 2,
            tagName: 'ul',
            attributes: { class: 'item-list' },
            childNodes: [],
            id: 22,
          },
        },
        {
          parentId: 22,
          nextId: 24,
          node: { type: 3, textContent: '\n          \n            ', id: 23 },
        },
        {
          parentId: 22,
          nextId: 29,
          node: {
            type: 2,
            tagName: 'li',
            attributes: {},
            childNodes: [],
            id: 24,
          },
        },
        {
          parentId: 24,
          nextId: 26,
          node: {
            type: 3,
            textContent: 'First item on the list\n              ',
            id: 25,
          },
        },
        {
          parentId: 24,
          nextId: 28,
          node: {
            type: 2,
            tagName: 'button',
            attributes: { class: 'editable-list-remove-item icon' },
            childNodes: [],
            id: 26,
          },
        },
        {
          parentId: 26,
          nextId: null,
          node: { type: 3, textContent: '⊖', id: 27 },
        },
        {
          parentId: 24,
          nextId: null,
          node: { type: 3, textContent: '\n            ', id: 28 },
        },
        {
          parentId: 22,
          nextId: 30,
          node: { type: 3, textContent: '\n          \n            ', id: 29 },
        },
        {
          parentId: 22,
          nextId: 35,
          node: {
            type: 2,
            tagName: 'li',
            attributes: {},
            childNodes: [],
            id: 30,
          },
        },
        {
          parentId: 30,
          nextId: 32,
          node: {
            type: 3,
            textContent: 'Second item on the list\n              ',
            id: 31,
          },
        },
        {
          parentId: 30,
          nextId: 34,
          node: {
            type: 2,
            tagName: 'button',
            attributes: { class: 'editable-list-remove-item icon' },
            childNodes: [],
            id: 32,
          },
        },
        {
          parentId: 32,
          nextId: null,
          node: { type: 3, textContent: '⊖', id: 33 },
        },
        {
          parentId: 30,
          nextId: null,
          node: { type: 3, textContent: '\n            ', id: 34 },
        },
        {
          parentId: 22,
          nextId: 36,
          node: { type: 3, textContent: '\n          \n            ', id: 35 },
        },
        {
          parentId: 22,
          nextId: 41,
          node: {
            type: 2,
            tagName: 'li',
            attributes: {},
            childNodes: [],
            id: 36,
          },
        },
        {
          parentId: 36,
          nextId: 38,
          node: {
            type: 3,
            textContent: 'Third item on the list\n              ',
            id: 37,
          },
        },
        {
          parentId: 36,
          nextId: 40,
          node: {
            type: 2,
            tagName: 'button',
            attributes: { class: 'editable-list-remove-item icon' },
            childNodes: [],
            id: 38,
          },
        },
        {
          parentId: 38,
          nextId: null,
          node: { type: 3, textContent: '⊖', id: 39 },
        },
        {
          parentId: 36,
          nextId: null,
          node: { type: 3, textContent: '\n            ', id: 40 },
        },
        {
          parentId: 22,
          nextId: 42,
          node: { type: 3, textContent: '\n          \n            ', id: 41 },
        },
        {
          parentId: 22,
          nextId: 47,
          node: {
            type: 2,
            tagName: 'li',
            attributes: {},
            childNodes: [],
            id: 42,
          },
        },
        {
          parentId: 42,
          nextId: 44,
          node: {
            type: 3,
            textContent: 'Fourth item on the list\n              ',
            id: 43,
          },
        },
        {
          parentId: 42,
          nextId: 46,
          node: {
            type: 2,
            tagName: 'button',
            attributes: { class: 'editable-list-remove-item icon' },
            childNodes: [],
            id: 44,
          },
        },
        {
          parentId: 44,
          nextId: null,
          node: { type: 3, textContent: '⊖', id: 45 },
        },
        {
          parentId: 42,
          nextId: null,
          node: { type: 3, textContent: '\n            ', id: 46 },
        },
        {
          parentId: 22,
          nextId: 48,
          node: { type: 3, textContent: '\n          \n            ', id: 47 },
        },
        {
          parentId: 22,
          nextId: 53,
          node: {
            type: 2,
            tagName: 'li',
            attributes: {},
            childNodes: [],
            id: 48,
          },
        },
        {
          parentId: 48,
          nextId: 50,
          node: {
            type: 3,
            textContent: 'Fifth item on the list\n              ',
            id: 49,
          },
        },
        {
          parentId: 48,
          nextId: 52,
          node: {
            type: 2,
            tagName: 'button',
            attributes: { class: 'editable-list-remove-item icon' },
            childNodes: [],
            id: 50,
          },
        },
        {
          parentId: 50,
          nextId: null,
          node: { type: 3, textContent: '⊖', id: 51 },
        },
        {
          parentId: 14,
          nextId: 65,
          node: {
            type: 2,
            tagName: 'div',
            attributes: {},
            childNodes: [],
            id: 55,
          },
        },
        {
          parentId: 55,
          nextId: 57,
          node: { type: 3, textContent: '\n          ', id: 56 },
        },
        {
          parentId: 55,
          nextId: 59,
          node: {
            type: 2,
            tagName: 'label',
            attributes: {},
            childNodes: [],
            id: 57,
          },
        },
        {
          parentId: 57,
          nextId: null,
          node: { type: 3, textContent: 'Add new list item:', id: 58 },
        },
        {
          parentId: 55,
          nextId: 60,
          node: { type: 3, textContent: '\n          ', id: 59 },
        },
        {
          parentId: 55,
          nextId: 61,
          node: {
            type: 2,
            tagName: 'input',
            attributes: { class: 'add-new-list-item-input', type: 'text' },
            childNodes: [],
            id: 60,
          },
        },
        {
          parentId: 55,
          nextId: 62,
          node: { type: 3, textContent: '\n          ', id: 61 },
        },
        {
          parentId: 55,
          nextId: 64,
          node: {
            type: 2,
            tagName: 'button',
            attributes: { class: 'editable-list-add-item icon' },
            childNodes: [],
            id: 62,
          },
        },
        {
          parentId: 62,
          nextId: null,
          node: { type: 3, textContent: '⊕', id: 63 },
        },
        {
          parentId: 55,
          nextId: null,
          node: { type: 3, textContent: '\n        ', id: 64 },
        },
        {
          parentId: 14,
          nextId: null,
          node: { type: 3, textContent: '\n      ', id: 65 },
        },
      ],
    },
    timestamp: now + 400,
  },
];

export default events;
