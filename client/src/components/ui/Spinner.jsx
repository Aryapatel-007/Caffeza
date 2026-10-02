/**
 * A loading indicator. A screen showing nothing while it loads looks broken,
 * and a screen that looks broken during a Friday rush costs us the account.
 */
const SIZES = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-10 border-4',
};

export default function Spinner({ size = 'md', label = 'Loading', className = '' }) {
  return (
    <div role="status" className={`flex items-center gap-3 ${className}`}>
      <span aria-hidden="true" className={['animate-spin rounded-full border-line border-t-accent', SIZES[size] ?? SIZES.md].join(' ')} />
      <span className="sr-only">{label}</span>
    </div>
  );
}
