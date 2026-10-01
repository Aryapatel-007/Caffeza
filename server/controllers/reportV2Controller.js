/**
 * M19 reports. Built in P14. The engine does the work; this sends the answer,
 * as JSON or, for `format=xlsx`, as the same envelope in a workbook.
 */
import { readBillDetail } from '../services/reports/definitions/bills.js';
import { personNames, runReport } from '../services/reports/engine.js';
import { buildWorkbook, workbookFileName, XLSX_CONTENT_TYPE } from '../services/reports/exportXlsx.js';
import { sendSuccess } from '../utils/response.js';

/** A handler for one report definition. */
export function getReport(definition) {
  return async function reportHandler(req, res) {
    const { envelope, meta, params } = await runReport(req, definition, req.query);

    if (params.format === 'xlsx') {
      const file = await buildWorkbook(envelope);
      res.set('Content-Type', XLSX_CONTENT_TYPE);
      res.set('Content-Disposition', `attachment; filename="${workbookFileName(req.currentRestaurant.name, envelope)}"`);
      return res.status(200).send(file);
    }

    if (meta) return res.status(200).json({ success: true, data: envelope, meta });
    return sendSuccess(res, envelope);
  };
}

/** GET /reports/v2/bills/:billId */
export async function getBillDetail(req, res) {
  return sendSuccess(res, await readBillDetail(req, req.params.billId, { personNames: (ids) => personNames(req, ids) }));
}
