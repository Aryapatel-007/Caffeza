/**
 * The button. DESIGN-SYSTEM section 9.
 *
 * Kinds: `primary` in the accent, the one primary action on a screen;
 * `secondary` with an `ink` border; `quiet`, text only; `danger` in `alert`.
 * `ghost` is the version 1 name for `quiet` and still works.
 *
 * 48px tall by default: the smallest target a thumb hits reliably in a rush.
 */
const VARIANTS = {
  primary: 'bg-accent text-on-accent hover:brightness-110',
  secondary: 'border border-ink bg-surface text-ink hover:bg-sunken',
  quiet: 'bg-transparent text-ink hover:bg-sunken',
  danger: 'bg-alert text-on-accent hover:brightness-110',
};
VARIANTS.ghost = VARIANTS.quiet;

const SIZES = {
  sm: 'min-h-10 px-3 type-label',
  md: 'min-h-12 px-4 type-button',
  lg: 'min-h-14 px-6 type-button',
};

export default function Button({
  type = 'button',
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  fullWidth = false,
  className = '',
  children,
  ...props
}) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {isLoading && (
        <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
