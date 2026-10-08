import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getPrintQueue } from '../../api/bills.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeProvider.jsx';
import { ROLES } from '../users/roles.js';

import { printBill } from './printBill.js';
import { rememberPrinted, useDeviceSettings } from './useDeviceSettings.js';

const TILL = [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER];
const POLL_MS = 5000;

/**
 * Prints the bills captains send to the counter. P25 Part D, API-CONTRACT M3
 * section 16.3. Draws nothing.
 *
 * On a counter computer with "Print bills sent by captains" on, it reads the
 * queue every 5 seconds and prints each bill once on this device's printer.
 * Each print records itself on the server, which takes the bill out of the
 * queue, and the device also remembers the request it printed, so a reload in
 * the moment between printing and recording never prints it twice. A bill
 * asked for again later is a new request and prints again, as a Duplicate.
 */
export default function CaptainBillPrinter() {
  const { user } = useAuth();
  const { brand } = useTheme();
  const [device, updateDevice] = useDeviceSettings();
  const queryClient = useQueryClient();
  const enabled = Boolean(device.printCaptainBills) && TILL.includes(user?.role);

  const queue = useQuery({
    queryKey: ['print-queue'],
    queryFn: getPrintQueue,
    enabled,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  const busy = useRef(false);
  useEffect(() => {
    if (!enabled || !queue.isSuccess || busy.current) return;
    const fresh = (queue.data ?? []).filter((bill) => !device.printedBillRequests.includes(`${bill.id}:${bill.printRequestedAt}`));
    if (fresh.length === 0) return;

    busy.current = true;
    (async () => {
      for (const bill of fresh) {
        const key = `${bill.id}:${bill.printRequestedAt}`;
        try {
          await printBill(bill.id, { printer: device.printer, logoDataUrl: brand.logos?.LIGHT_GROUND?.dataUrl ?? null });
        } catch {
          // Left in the queue: the next poll tries again.
          continue;
        }
        updateDevice((current) => ({ printedBillRequests: rememberPrinted(current.printedBillRequests, [key]) }));
      }
      busy.current = false;
      queryClient.invalidateQueries({ queryKey: ['print-queue'] });
    })();
  }, [enabled, queue.isSuccess, queue.data, device.printedBillRequests, device.printer, brand, updateDevice, queryClient]);

  return null;
}
