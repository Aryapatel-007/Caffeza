/**
 * Pieces the report definitions share. M19, P15.
 */
import { ROLES } from '../../../config/roles.js';
import { LABELS } from '../labels.js';

export const MANAGERS = Object.freeze([ROLES.OWNER, ROLES.MANAGER]);
export const OWNER_ONLY = Object.freeze([ROLES.OWNER]);

/** A bill's net sales inside a pipeline: the sum of its slabs' taxable values. */
export const netSalesExpr = {
  $reduce: { input: '$taxBreakdown', initialValue: 0, in: { $add: ['$$value', '$$this.taxableInPaise'] } },
};

/** A drill to R19 with exactly these filters. */
export const toBills = (query) => ({ report: 'R19', query });

/** R2-style sections: the Figure, its Count and its Value. */
export const FIGURE_COLUMNS = Object.freeze([
  { key: 'line', label: LABELS.FIGURE, type: 'text' },
  { key: 'count', label: LABELS.COUNT, type: 'count' },
  { key: 'amountInPaise', label: LABELS.VALUE, type: 'money' },
]);

export const money = (line, amountInPaise, drill) => ({ line, amountInPaise, ...(drill ? { drill: { amountInPaise: drill } } : {}) });
export const count = (line, value, drill) => ({ line, count: value, ...(drill ? { drill: { count: drill } } : {}) });
