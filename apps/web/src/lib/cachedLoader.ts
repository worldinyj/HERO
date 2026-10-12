export function cachedLoader<T>(loader: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;

  return () => {
    promise ??= loader().catch((error: unknown) => {
      promise = null;
      throw error;
    });
    return promise;
  };
}
