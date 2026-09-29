/**
 * Validation. Step 5 of the middleware chain.
 *
 * A controller can assume its input is already clean, because nothing reaches
 * a controller without passing through here first.
 *
 *   const createOrderSchema = z.object({
 *     params: z.object({ tableId: objectId }),
 *     body: z.object({ note: nonEmptyString.optional() }),
 *   });
 *
 *   router.post("/orders/:tableId", validate(createOrderSchema), createOrder);
 *
 * Whatever the schema parses is written back onto the request, so defaults,
 * trimming and coercion are visible to the controller. A controller that reads
 * req.query.limit gets the clamped number, not the raw string.
 */
import { ValidationError } from '../utils/errors.js';
import { replaceQuery } from '../utils/requestQuery.js';

/**
 * Turns a Zod path into the key the client sees.
 *
 * The leading body, query or params segment is dropped, because the client
 * sent a field called priceInPaise and that is what the error should name.
 * Array positions keep their index: items[0].quantity.
 */
function pathToFieldName(path) {
  return path.reduce((name, segment) => {
    if (typeof segment === 'number') return `${name}[${segment}]`;
    return name === '' ? String(segment) : `${name}.${segment}`;
  }, '');
}

/**
 * Builds the per-field map for error.fields.
 *
 * One message per field, the first one raised. A field that is both missing
 * and the wrong type reads better as one problem than as two.
 */
function toFieldMap(issues) {
  const fields = {};

  for (const issue of issues) {
    const path = issue.path.length > 1 ? issue.path.slice(1) : issue.path;
    const name = pathToFieldName(path) || 'body';
    if (!(name in fields)) fields[name] = issue.message;
  }

  return fields;
}

export function validate(schema) {
  return function runValidation(req, res, next) {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const fields = toFieldMap(result.error.issues);
      const count = Object.keys(fields).length;
      return next(
        new ValidationError(
          count === 1
            ? 'One of the values sent was not valid.'
            : `${count} of the values sent were not valid.`,
          fields,
        ),
      );
    }

    const { body, query, params } = result.data;

    if (body !== undefined) req.body = body;
    // req.query has no setter in Express 5, so it is replaced rather than assigned.
    if (query !== undefined) replaceQuery(req, query);
    // req.params is mutated in place: the router holds a reference to it.
    if (params !== undefined) Object.assign(req.params, params);

    return next();
  };
}
