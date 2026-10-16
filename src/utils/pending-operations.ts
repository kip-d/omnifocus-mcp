/**
 * OMN-348: `promise.finally(() => set.delete(promise))` looks like the right
 * way to clear a pending-operations entry on settle, but `.finally()` returns
 * a NEW derived promise that re-throws the original rejection after its
 * callback runs. When that derived promise is discarded (as it was at every
 * call site this replaces — `promise.finally(...)` with no `.catch` on the
 * result), nothing ever reads its rejection, so Node fires `unhandledRejection`
 * for it — even though the original `promise` may be perfectly well-handled by
 * its own caller.
 *
 * `.then(onFulfilled, onRejected)` with the SAME no-op cleanup in both arms
 * sidesteps this: an `onRejected` handler that doesn't rethrow makes the
 * derived promise RESOLVE, so it never rejects and never needs a `.catch`.
 */
export function trackPendingOperation<T>(set: Set<Promise<unknown>>, promise: Promise<T>): Promise<T> {
  set.add(promise);
  const remove = () => {
    set.delete(promise);
  };
  promise.then(remove, remove);
  return promise;
}
