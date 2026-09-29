import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import DataTable from '../../components/charts/DataTable.jsx';
import RankedBars from '../../components/charts/RankedBars.jsx';
import { StatTile } from '../../components/charts/StatTile.jsx';
import { getLabourHours } from '../../api/reports.js';
import { formatDateIst, formatTimeIst } from '../../utils/formatDate.js';
import { ROLE_LABELS } from '../users/roles.js';
import { errorMessage } from './errorCopy.js';
import { formatMinutes } from './formatReport.js';
import ReportShell, { lastNDays, ReportSection } from './ReportShell.jsx';

/**
 * Hours worked, per person, over a range.
 *
 * AN OPEN SHIFT IS WORTH ZERO MINUTES and is listed separately, which is the
 * one thing this screen has to get right. M5 refuses to invent a clock-out
 * time and this report refuses to invent elapsed time from one: a figure that
 * grows while you look at it is not an hours-worked number, and M11 will pay
 * people from these minutes.
 *
 * The open-shifts panel is not an error state. It is the screen surfacing a
 * forgotten clock-out to the person who can go and fix it.
 */
export default function LabourPage() {
  const [range, setRange] = useState(() => lastNDays(29));
  const enabled = Boolean(range.from && range.to && range.from <= range.to);

  const query = useQuery({
    queryKey: ['reports', 'labour-hours', range],
    queryFn: () => getLabourHours(range),
    enabled,
    placeholderData: (previous) => previous,
  });

  const data = query.data;

  return (
    <ReportShell title="Labour" range={range} onRangeChange={setRange}>
      {query.isError && <p className="mb-6 text-[15px] text-mirch">{errorMessage(query.error)}</p>}

      {data && (
        <div className={query.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile
              label="Total hours"
              value={formatMinutes(data.totalMinutes)}
              hint="Closed shifts only"
            />
            <StatTile label="People" value={data.byUser.length} />
            <StatTile
              label="Open shifts"
              value={data.openShifts.length}
              hint={
                data.openShifts.length > 0
                  ? 'Worth zero minutes until closed'
                  : 'Everyone is clocked out'
              }
            />
          </div>

          {data.openShifts.length > 0 && (
            <ReportSection
              title="Still clocked in"
              description="These contribute no minutes to any figure on this screen. Close them from the attendance register."
            >
              <DataTable
                caption="Open shifts"
                columns={[
                  { key: 'name', header: 'Person' },
                  { key: 'businessDate', header: 'Business day' },
                  {
                    key: 'clockInAt',
                    header: 'Clocked in',
                    render: (row) => `${formatDateIst(row.clockInAt)} ${formatTimeIst(row.clockInAt)}`,
                  },
                ]}
                rows={data.openShifts.map((row, index) => ({ ...row, key: `${row.userId}-${index}` }))}
              />
            </ReportSection>
          )}

          <ReportSection
            title="Hours by person"
            description="Whole minutes, computed by the clock when each shift closed and never recalculated here."
          >
            <RankedBars
              data={data.byUser}
              labelKey="name"
              valueKey="totalMinutes"
              formatValue={formatMinutes}
              secondaryKey="shiftCount"
              formatSecondary={(count) => `${count} shifts`}
              emptyMessage="Nobody worked a closed shift in this range."
            />
          </ReportSection>

          <ReportSection title="The numbers">
            <DataTable
              caption="Hours worked"
              columns={[
                { key: 'name', header: 'Person' },
                {
                  key: 'role',
                  header: 'Role',
                  render: (row) => ROLE_LABELS[row.role] ?? row.role ?? '',
                },
                {
                  key: 'totalMinutes',
                  header: 'Total',
                  numeric: true,
                  render: (row) => formatMinutes(row.totalMinutes),
                },
                { key: 'shiftCount', header: 'Shifts', numeric: true },
                {
                  key: 'averageShiftMinutes',
                  header: 'Average shift',
                  numeric: true,
                  render: (row) => formatMinutes(row.averageShiftMinutes),
                },
                { key: 'openShiftCount', header: 'Open', numeric: true },
              ]}
              rows={data.byUser.map((row) => ({ ...row, key: row.userId }))}
              emptyMessage="Nobody worked in this range."
            />
          </ReportSection>
        </div>
      )}
    </ReportShell>
  );
}
