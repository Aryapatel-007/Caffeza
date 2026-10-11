/**
 * Runs something once a write is safely in. P33, shared from P37.
 *
 * A write inside a transaction is held until the session ends, and the
 * function runs only if the transaction committed: one that rolled back
 * changed nothing, so telling screens or guests about it would be wrong. A
 * write with no session runs it straight away. `fn` never fails the write:
 * anything it throws is caught here.
 */
const COMMITTED = ['TRANSACTION_COMMITTED', 'TRANSACTION_COMMITTED_EMPTY'];

const safely = (fn) => {
  try {
    const result = fn();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // Never the write's problem.
  }
};

export function runAfterCommit(session, fn) {
  if (!session || typeof session.inTransaction !== 'function' || !session.inTransaction()) {
    safely(fn);
    return;
  }
  if (!session.afterCommit) {
    session.afterCommit = [];
    session.once('ended', () => {
      try {
        // The state itself: the driver's `isCommitted` is true for an aborted transaction too.
        if (COMMITTED.includes(session.transaction?.state)) session.afterCommit.forEach(safely);
      } finally {
        session.afterCommit = [];
      }
    });
  }
  session.afterCommit.push(fn);
}

export default { runAfterCommit };
