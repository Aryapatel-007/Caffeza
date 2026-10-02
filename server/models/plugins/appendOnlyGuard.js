/**
 * Makes a collection append-only by construction. M8.
 *
 * Every Mongoose path that could change or remove an existing document throws
 * `AuditLogImmutableError` before it reaches the database: the update and
 * delete queries, the document `deleteOne`, and a `save` of a document that is
 * not new. Creating documents is untouched.
 *
 * Same spirit as `tenantGuard`: the worst possible mistake becomes a loud crash
 * on a developer's machine rather than a quiet data problem. Unlike that guard
 * there is no escape hatch, because nothing legitimately edits an audit line.
 *
 * Driver-level writes on the raw collection, as the test helpers use to clear
 * a database between files, do not pass through Mongoose and are not guarded.
 * No application code reaches for the raw collection.
 */
import { AuditLogImmutableError } from '../../utils/errors.js';

const QUERY_OPERATIONS = [
  'updateOne',
  'updateMany',
  'replaceOne',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'deleteOne',
  'deleteMany',
];

export function appendOnlyGuardPlugin(schema) {
  for (const operation of QUERY_OPERATIONS) {
    schema.pre(operation, { query: true, document: false }, function blockQuery() {
      throw new AuditLogImmutableError(operation);
    });
  }

  schema.pre('deleteOne', { query: false, document: true }, function blockDocumentDelete() {
    throw new AuditLogImmutableError('deleteOne');
  });

  schema.pre('save', function blockResave() {
    if (!this.isNew) throw new AuditLogImmutableError('save');
  });

  schema.pre('bulkWrite', function blockBulkWrite() {
    throw new AuditLogImmutableError('bulkWrite');
  });
}

export default appendOnlyGuardPlugin;
