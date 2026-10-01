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
export default function PanelShell({ title, subtitle = null, wide = false, onCancel, children }) {
  return (
    <div className="fixed inset-0 z-30 flex">
      <button type="button" aria-label="Close" onClick={onCancel} className="flex-1 bg-[#141210]/55" />

      <aside
        role="dialog"
        aria-label={title}
        className={[
          'flex w-full flex-col overflow-y-auto bg-white px-5 py-5 shadow-[-8px_0_30px_rgba(28,27,25,0.18)]',
          wide ? 'max-w-[580px] sm:px-8' : 'max-w-md',
        ].join(' ')}
      >
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[20px] font-semibold leading-7">{title}</h2>
            {subtitle && <p className="mt-1 font-mono text-[13px] text-steel">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex size-10 items-center justify-center rounded-full bg-linen-2 text-steel hover:bg-linen-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            ✕
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}
