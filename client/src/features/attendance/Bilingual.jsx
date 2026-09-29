/**
 * An English label with its Hindi pair underneath.
 *
 * Used on the clock screen only (D6). English is primary; Hindi is the quieter
 * second line. Both always render — this component has no "pick one" mode.
 *
 * It renders a plain block; a caller that needs a heading level wraps it in the
 * right tag. `align` handles the few places the pair is centred.
 */
export default function Bilingual({ label, size = 'md', align = 'left', className = '' }) {
  const en = {
    sm: 'text-[13px] leading-[18px]',
    md: 'text-[15px] leading-[22px]',
    lg: 'text-xl leading-7 font-semibold',
  }[size];

  return (
    <span
      className={`flex flex-col ${
        align === 'center' ? 'items-center text-center' : 'items-start'
      } ${className}`}
    >
      <span className={`${en} text-ink`}>{label.en}</span>
      <span lang="hi" className="text-[13px] leading-[18px] text-steel">
        {label.hi}
      </span>
    </span>
  );
}
