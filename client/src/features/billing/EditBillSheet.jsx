import Sheet from '../../components/ui/Sheet.jsx';

/**
 * P66. Edit bill, for owner and manager: every change to a bill already made,
 * in one place. Each opens its own sheet; nothing changes from here.
 */
export default function EditBillSheet({ bill, canChangePayments, canReprice = true, canChangeItems, onPick, onCancel }) {
  const choices = [
    canChangePayments && ['change-payments', 'Change payments', 'How it was paid, like Cash ₹795 to UPI ₹400 and Cash ₹395. The total stays the same.'],
    canReprice && ['reprice', 'Change discount or GST', 'Another discount, none, or prices including GST. A new bill is made and the payments carry over.'],
    canChangeItems && ['add-items', 'Add items', 'The table orders more. The money paid carries to the new bill.'],
    canChangeItems && ['cancel-items', 'Cancel an item', 'Take a dish off. Cash over the new total is handed back.'],
  ].filter(Boolean);

  return (
    <Sheet title="Edit bill" subtitle={`Bill ${bill.billNumber}`} onCancel={onCancel}>
      <ul className="flex flex-col gap-2">
        {choices.map(([key, label, detail]) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onPick(key)}
              className={['flex min-h-14 w-full flex-col items-start rounded-lg border border-line px-4 py-3 text-left hover:bg-sunken', key === 'cancel-items' ? 'text-alert' : ''].join(' ')}
            >
              <span className="type-button">{label}</span>
              <span className="type-caption text-muted">{detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
