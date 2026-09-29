/**
 * Running a piece of work in a transaction, where the connection has one.
 *
 * Atlas and a replica set do. A standalone local mongod does not, and refusing
 * to run at all there would mean M2 could not be developed against one. So the
 * work runs either way, and the caller is told which mode it got, because the
 * guarantees are not the same and pretending otherwise is how a half-written
 * pair of documents goes unnoticed.
 *
 * `scripts/provisionRestaurant.js` has an older copy of this shape from M0-B.
 * It should be switched over to this one on the next M0 touch; it was not done
 * here because M2 is not scoped to change M0 code. See PROJECT-STATE.md.
 */
import mongoose from 'mongoose';

/** A standalone mongod has no replica set, so it cannot do transactions. */
export function isTransactionUnsupported(error) {
  const message = String(error?.message ?? '');
  return (
    error?.code === 20 ||
    /Transaction numbers are only allowed on a replica set/i.test(message) ||
    /does not support (?:sessions|transactions)/i.test(message) ||
    /Transactions are not supported/i.test(message)
  );
}

/**
 * Runs `work` inside a transaction if one is available, otherwise plainly.
 *
 * `work` is called with a session, or with null when there is none, and must
 * pass it to every operation it performs. It may be called more than once:
 * withTransaction retries on a transient conflict, which is Mongo's normal
 * behaviour and the reason `work` must not have side effects outside the
 * database.
 *
 * `onFailureWithoutTransaction` is the escape hatch for the no-transaction
 * path: it is called when the work throws and there was no transaction to roll
 * back, so the caller can undo by hand whatever it managed to write. It is not
 * called when a real transaction aborted, because the database has already
 * undone it.
 */
export async function withOptionalTransaction(work, { onFailureWithoutTransaction } = {}) {
  let session;
  try {
    session = await mongoose.startSession();
  } catch {
    session = null;
  }

  if (session) {
    try {
      let result;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } catch (error) {
      if (!isTransactionUnsupported(error)) throw error;
      // Fall through to the plain path below.
    } finally {
      await session.endSession();
    }
  }

  try {
    return await work(null);
  } catch (error) {
    await onFailureWithoutTransaction?.(error);
    throw error;
  }
}

export default withOptionalTransaction;
