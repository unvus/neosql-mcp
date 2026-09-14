/** Bound observation of I/O, including APIs which cannot cancel their underlying work. */
export const observe = <T>(
  signal: AbortSignal | undefined,
  start: () => Promise<T>,
): Promise<T> => {
  signal?.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(signal?.reason);
    };
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });
    Promise.resolve()
      .then(() => {
        signal?.throwIfAborted();
        return start();
      })
      .then(
        (value) => {
          cleanup();
          if (signal?.aborted) reject(signal.reason);
          else resolve(value);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
  });
};

export const pause = (ms: number, signal: AbortSignal): Promise<void> => {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
};
