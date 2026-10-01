/**
 * R4 Hours and Weekdays. M19, built in P15. docs/API-CONTRACT.md "M19" R4.
 *
 * Net sales and bills by the hour the bill was issued, in DISPLAY_TIMEZONE,
 * every hour present; and a grid of weekday against hour, Monday first. The
 * hour is worked out in the aggregation, from the UTC `billedAt`, never by
 * shifting a stored time.
 */
import { config } from '../../../config/env.js';
import { Bill } from '../../../models/Bill.js';
import { sumPaise } from '../../../utils/money.js';
import { checkC5 } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { MANAGERS, netSalesExpr, toBills } from './shared.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const hourColumns = [
  { key: 'hour', label: LABELS.HOUR, type: 'count' },
  { key: 'billCount', label: LABELS.BILLS, type: 'count' },
  { key: 'netSalesInPaise', label: LABELS.NET_SALES, type: 'money' },
];

const gridColumns = [
  { key: 'weekday', label: LABELS.WEEKDAY, type: 'text' },
  ...HOURS.map((hour) => ({ key: `h${hour}InPaise`, label: LABELS.NET_SALES, type: 'money' })),
];

export default {
  id: 'R4',
  name: 'hours',
  title: 'Hours and Weekdays',
  roles: MANAGERS,
  schema: reportQuery(['orderType']),
  filters: ['orderType'],
  dimensions: ['orderType'],
  columns: hourColumns,

  async query(req, baseMatch, params) {
    const grouped = await Bill.aggregate([
      { $match: { ...baseMatch, ...(params.orderType ? { orderType: params.orderType } : {}) } },
      {
        $group: {
          _id: {
            hour: { $hour: { date: '$billedAt', timezone: config.DISPLAY_TIMEZONE } },
            weekday: { $isoDayOfWeek: { $dateFromString: { dateString: '$businessDate' } } },
          },
          billCount: { $sum: 1 },
          netSalesInPaise: { $sum: netSalesExpr },
        },
      },
    ]);

    const base = { from: params.from, to: params.to, ...(params.orderType ? { orderType: params.orderType } : {}) };
    const byHour = HOURS.map((hour) => {
      const cells = grouped.filter((row) => row._id.hour === hour);
      return {
        hour,
        billCount: cells.reduce((total, row) => total + row.billCount, 0),
        netSalesInPaise: sumPaise(0, ...cells.map((row) => row.netSalesInPaise)),
        drill: { billCount: toBills({ ...base, hour }), netSalesInPaise: toBills({ ...base, hour }) },
      };
    });
    const grid = WEEKDAYS.map((weekday, index) => {
      const row = { weekday };
      for (const hour of HOURS) {
        const cell = grouped.find((entry) => entry._id.hour === hour && entry._id.weekday === index + 1);
        row[`h${hour}InPaise`] = cell?.netSalesInPaise ?? 0;
      }
      return row;
    });

    const totals = {
      billCount: byHour.reduce((total, row) => total + row.billCount, 0),
      netSalesInPaise: sumPaise(0, ...byHour.map((row) => row.netSalesInPaise)),
    };
    const [whole] = await Bill.aggregate([
      { $match: { ...baseMatch, ...(params.orderType ? { orderType: params.orderType } : {}) } },
      { $group: { _id: null, netSalesInPaise: { $sum: netSalesExpr } } },
    ]);

    return {
      sections: [
        { key: 'byHour', title: 'By hour', columns: hourColumns, rows: byHour, totals },
        { key: 'weekdayByHour', title: 'Weekday by hour', columns: gridColumns, rows: grid },
      ],
      byHour,
      wholeNetSalesInPaise: whole?.netSalesInPaise ?? 0,
    };
  },

  checks(req, params, result) {
    return [checkC5(5, result.byHour, 'netSalesInPaise', result.wholeNetSalesInPaise)];
  },
};
