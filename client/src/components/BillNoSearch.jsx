import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { findBillsByNumber } from '../api/bills.js';
import { formatBusinessDate } from '../utils/formatDate.js';
import Money from './ui/Money.jsx';
import { SearchIcon } from './ui/icons/index.jsx';

/**
 * P48. PetPooja's "Bill No" box in the top bar, for the till: type the number
 * after the series and the bill opens, to print again, change how it was paid
 * or cancel. The same number in two financial years offers both to pick.
 */
export default function BillNoSearch() {
  const navigate = useNavigate();
  const [number, setNumber] = useState('');
  const [found, setFound] = useState(null);
  const [message, setMessage] = useState(null);

  const open = (id) => {
    setFound(null);
    setNumber('');
    setMessage(null);
    navigate(`/bills/${id}`);
  };

  const search = async (event) => {
    event.preventDefault();
    const value = Number(number);
    if (!Number.isInteger(value) || value < 1) return;
    try {
      const { data } = await findBillsByNumber(value);
      if (data.length === 1) return open(data[0].id);
      setFound(data);
      setMessage(data.length === 0 ? `No bill ${value}.` : null);
    } catch {
      setMessage('Could not look it up. Try again.');
    }
    return undefined;
  };

  return (
    <form onSubmit={search} role="search" aria-label="Bill No" className="relative flex items-center">
      <SearchIcon className="pointer-events-none absolute left-3 text-muted" />
      <input
        type="text"
        inputMode="numeric"
        aria-label="Bill No"
        placeholder="Bill No"
        value={number}
        onChange={(event) => {
          setNumber(event.target.value.replace(/\D/g, ''));
          setMessage(null);
          setFound(null);
        }}
        className="type-body min-h-10 w-32 rounded-lg border border-line bg-surface pl-9 pr-2 sm:w-40"
      />
      {(message || (found && found.length > 1)) && (
        <div role="status" className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-line bg-surface p-2 shadow-float">
          {message && <p className="type-body px-2 py-1 text-muted">{message}</p>}
          {found && found.length > 1 && (
            <ul>
              {found.map((bill) => (
                <li key={bill.id}>
                  <button type="button" onClick={() => open(bill.id)} className="flex min-h-12 w-full items-center justify-between gap-2 rounded-lg px-2 text-left hover:bg-sunken">
                    <span className="type-label">
                      {bill.billNumber}
                      <span className="type-caption block text-muted">{formatBusinessDate(bill.businessDate)}{bill.isVoided ? ' · cancelled' : ''}</span>
                    </span>
                    <Money paise={bill.grandTotalInPaise} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
