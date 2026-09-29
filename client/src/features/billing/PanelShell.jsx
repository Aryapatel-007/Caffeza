/**
 * The slide-over shell every billing panel uses.
 *
 * DESIGN-SYSTEM.md section 6: a slide-over, not a modal, for editing one
 * record. A modal blocks the rest of the screen; a cashier mid-payment
 * frequently needs to glance back at the bill total behind the panel.
 *
 * Extracted once PaymentPanel and DiscountPanel both needed the identical
 * shell, the same reasoning that pulled shared code out anywhere else in this
 * project: two copies is how one drifts.
 */
export default function PanelShell({ title, onCancel, children }) {
  return (
    <div className="fixed inset-0 z-30 flex">
      <button type="button" aria-label="Close" onClick={onCancel} className="flex-1 bg-ink/30" />

      <aside
        role="dialog"
        aria-label={title}
        className="flex w-full max-w-md flex-col overflow-y-auto border-l-2 border-ink bg-paper px-4 py-4 shadow-[-8px_0_24px_rgba(28,27,25,0.18)]"
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-[20px] font-semibold leading-7">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex size-10 items-center justify-center rounded-lg text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            ✕
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}
