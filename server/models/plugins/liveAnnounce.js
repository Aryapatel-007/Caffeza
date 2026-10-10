/**
 * Announces on the live channel when a collection changes. P33.
 *
 *   orderSchema.plugin(liveAnnouncePlugin, { topics: ['tables'] });
 *
 * In the model, so every service that writes the collection announces it,
 * including the ones written after this, without anyone remembering to.
 *
 * A write inside a transaction is held until the session ends, and announced
 * only if the transaction committed: one that rolled back changed nothing, so
 * telling screens to read again would only be noise. A write with no session
 * is announced straight away. Nothing here can fail the write: `announce`
 * never throws, and everything around it is caught.
 *
 * Covered: save (and so create), the query writes and insertMany. None of the
 * announced collections is written with bulkWrite or through the raw driver;
 * a write added that way would not be announced, and screens would still see
 * it on their next poll.
 */
import { announce } from '../../services/live/bus.js';

const COMMITTED = ['TRANSACTION_COMMITTED', 'TRANSACTION_COMMITTED_EMPTY'];
const QUERY_WRITES = ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'];

/** The restaurant a value names, when it names exactly one. */
function oneId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.toHexString === 'function') return value.toHexString();
  return null;
}

/** Announce now, or when this session's transaction commits. */
function announceAfterCommit(session, topics, restaurantId, branchId) {
  if (!restaurantId) return;
  const send = () => topics.forEach((topic) => announce(topic, restaurantId, branchId));
  if (!session || typeof session.inTransaction !== 'function' || !session.inTransaction()) {
    send();
    return;
  }
  if (!session.liveAnnouncements) {
    session.liveAnnouncements = [];
    session.once('ended', () => {
      try {
        // The state itself: the driver's `isCommitted` is true for an aborted transaction too.
        if (COMMITTED.includes(session.transaction?.state)) session.liveAnnouncements.forEach((later) => later());
      } finally {
        session.liveAnnouncements = [];
      }
    });
  }
  session.liveAnnouncements.push(send);
}

export function liveAnnouncePlugin(schema, { topics }) {
  const fromDocument = (session, document) =>
    announceAfterCommit(session, topics, oneId(document?.restaurantId), oneId(document?.branchId));

  schema.post('save', function announceSave(document) {
    try {
      fromDocument(document.$session?.(), document);
    } catch {
      // An announcement never fails a write.
    }
  });

  schema.post(QUERY_WRITES, function announceQuery(result) {
    try {
      const filter = this.getFilter?.() ?? {};
      const session = this.getOptions?.().session ?? null;
      const restaurantId = oneId(filter.restaurantId) ?? oneId(result?.restaurantId);
      const branchId = oneId(filter.branchId) ?? oneId(result?.branchId);
      announceAfterCommit(session, topics, restaurantId, branchId);
    } catch {
      // An announcement never fails a write.
    }
  });

  schema.post('insertMany', function announceInsertMany(documents, ...rest) {
    try {
      const options = rest.find((value) => value && typeof value === 'object' && !Array.isArray(value)) ?? {};
      const seen = new Set();
      for (const document of Array.isArray(documents) ? documents : [documents]) {
        const restaurantId = oneId(document?.restaurantId);
        if (!restaurantId || seen.has(restaurantId)) continue;
        seen.add(restaurantId);
        announceAfterCommit(options.session ?? null, topics, restaurantId, oneId(document?.branchId));
      }
    } catch {
      // An announcement never fails a write.
    }
  });
}
