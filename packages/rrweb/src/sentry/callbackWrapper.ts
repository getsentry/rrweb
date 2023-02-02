/**
 * Try to set `__rrweb__` on all errors thrown by the given callback.
 * This can be used to filter these/handle them specifically.
 */
export const callbackWrapper = <T extends Function>(cb: T): T => {
  // @ts-ignore
  const rrwebWrapped: T = (...rest: any[]) => {
    try {
      return cb(...rest);
    } catch (error) {
      try {
        error.__rrweb__ = true;
      } catch {
        // ignore errors here
      }

      throw error;
    }
  };

  return rrwebWrapped;
};
