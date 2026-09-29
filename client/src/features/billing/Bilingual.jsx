/**
 * An English label with its Gujarati pair underneath.
 *
 * The billing screen's version of M5's attendance/Bilingual.jsx. A separate
 * component rather than a shared import, on purpose: M5's file is explicitly
 * scoped to the clock screen ("do not import features/attendance/labels.js
 * anywhere else"), and the two carry different languages for a reason — this
 * is Gujarati, not Hindi. Both always render; there is no "pick one" mode and
 * no switcher.
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
      <span lang="gu" className="text-[13px] leading-[18px] text-steel">
        {label.gu}
      </span>
    </span>
  );
}
