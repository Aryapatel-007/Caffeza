/**
 * The one toJSON transform.
 *
 * The API speaks `id`. Mongo speaks `_id`. The version key is ours and is
 * nobody else's business.
 *
 * This was inlined in baseSchema.js until M1 needed the same six lines on two
 * subdocument schemas. A subdocument schema cannot use baseSchemaPlugin, because
 * a variant has no restaurantId of its own, so without extracting this the
 * transform would have been written out three times and drifted the first time
 * one copy was edited.
 *
 * `strip` removes derived internal fields that exist to serve an index and are
 * not part of the API contract. M1 uses it for `nameLower`.
 */
export function applyJsonTransform(schema, { strip = [] } = {}) {
  schema.set('toJSON', {
    versionKey: false,
    transform(_document, record) {
      record.id = record._id?.toString();
      delete record._id;
      delete record.__v;
      for (const field of strip) delete record[field];
      return record;
    },
  });
}

export default applyJsonTransform;
