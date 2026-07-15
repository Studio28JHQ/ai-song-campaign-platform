import type { SVGProps } from "react";

/**
 * Sprint UI-3A — Landing Experience. Small, hand-authored line icons
 * for the registration card's fields ("SVG icons where appropriate") —
 * `currentColor`-based so they inherit `CampaignInput`'s icon-slot text
 * color automatically, no separate palette to maintain. Decorative
 * only (the field's own `CampaignLabel` already names it), so callers
 * render them inside `CampaignField`'s `icon` slot, which already
 * marks the wrapper `aria-hidden`.
 */

function baseProps(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...props,
  };
}

export function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.5-4 4.2-6 7.5-6s6 2 7.5 6" />
    </svg>
  );
}

export function BabyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="10" r="6" />
      <path d="M9 10c0 1 .8 1.8 1.8 1.8" />
      <path d="M9.5 8.5s.8-1 1.5-1M14.5 8.5s-.8-1-1.5-1" />
      <path d="M8 19c1.2-1 2.6-1.5 4-1.5s2.8.5 4 1.5" />
    </svg>
  );
}

export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3M16 3v3" />
    </svg>
  );
}

export function MapPinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v3c0 1.4-1.2 2.5-2.6 2.3-4.7-.7-9.2-4.3-11.6-8.6C4.2 8.4 4 5.2 6.5 3.5Z" />
    </svg>
  );
}
