import { INode, ICanvas } from '@sentry-internal/rrweb-snapshot';
import {
  blockClass,
  IWindow,
  listenerHandler,
  blockSelector,
} from '../../../types';
import { isBlocked, patch } from '../../../utils';

export default function initCanvasContextObserver(
  win: IWindow,
  blockClass: blockClass,
  blockSelector: blockSelector,
  unblockSelector: blockSelector,
): listenerHandler {
  const handlers: listenerHandler[] = [];
  try {
    const restoreHandler = patch(
      win.HTMLCanvasElement.prototype,
      'getContext',
      function (original) {
        return function (
          this: ICanvas,
          contextType: string,
          ...args: Array<unknown>
        ) {
          if (
            !isBlocked(
              (this as unknown) as INode,
              blockClass,
              blockSelector,
              unblockSelector,
            )
          ) {
            if (!('__context' in this))
              (this as ICanvas).__context = contextType;
          }
          return original.apply(this, [contextType, ...args]);
        };
      },
    );
    handlers.push(restoreHandler);
  } catch {
    console.error('failed to patch HTMLCanvasElement.prototype.getContext');
  }
  return () => {
    handlers.forEach((h) => h());
  };
}
