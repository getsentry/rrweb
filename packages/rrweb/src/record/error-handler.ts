import type { ErrorHandler } from '../types';

type Callback = (...args: unknown[]) => unknown;

let errorHandler: ErrorHandler | undefined;

export function registerErrorHandler(handler: ErrorHandler | undefined) {
  errorHandler = handler;
}

export function unregisterErrorHandler() {
  errorHandler = undefined;
}

/**
 * Wrap callbacks in a wrapper that allows to pass errors to a configured `errorHandler` method.
 */
export const callbackWrapper = <T extends Callback>(cb: T, errorSource?: string): T => {
  if (!errorHandler) {
    return cb;
  }

  const rrwebWrapped = ((...rest: unknown[]) => {
    try {
      return cb(...rest);
    } catch (error) {
      // Some libraries (styled-components) rely on an exception to be thrown.
      // Attach an optional property here to allow `errorHandler` to make
      // additional decisions (e.g. to re-throw).
      if (errorSource) {
        error.__source__ = errorSource;
      }

      if (errorHandler && errorHandler(error) === true) {
        return () => {
          // This will get called by `record()`'s cleanup function
        };
      }

      throw error;
    }
  }) as unknown as T;

  return rrwebWrapped;
};
