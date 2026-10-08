/**
 * A dish's photo. P24. With BrandLogo, the only component allowed to draw an
 * image: the design guard test holds that line.
 *
 * Lazy and decoded off the main thread, cropped to fill its box. Without a
 * photo, or if it fails to load, a still tile with the dish's first letter
 * on a tint of the accent, so a menu without photos still looks deliberate.
 */
import { useState } from 'react';

export default function DishPhoto({ src, name, className = '', letterClassName = 'text-[2.5rem]' }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        aria-hidden="true"
        className={`flex items-center justify-center bg-[color-mix(in_srgb,var(--color-accent)_14%,var(--color-surface))] text-accent ${className}`}
      >
        <span className={`font-anek font-[680] leading-none [font-stretch:112%] ${letterClassName}`}>
          {(name ?? '?').trim().charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={`block object-cover ${className}`}
    />
  );
}
