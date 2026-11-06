import type { SVGProps } from 'react';

function Svg(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} />;
}

export function OverviewIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
    </Svg>
  );
}

export function SendIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M7 17 17 7M9 7h8v8" />
    </Svg>
  );
}

export function ReceiveIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M17 7 7 17M15 17H7V9" />
    </Svg>
  );
}

export function PayIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M8 12h8" />
    </Svg>
  );
}

export function WithdrawIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M12 14V4M8 8l4-4 4 4M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14" />
    </Svg>
  );
}

export function ActivityIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M4 12h3.5l2-5 4 10 2-5H20" />
    </Svg>
  );
}

export function SettingsIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </Svg>
  );
}

export function AddIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function CashOutIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M7 9.5v5M17 9.5v5" />
    </Svg>
  );
}

export function ServicesIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6z" />
    </Svg>
  );
}

export function RequestsIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2zM9 8.5h6M9 12h6" />
    </Svg>
  );
}

export function BellIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5zM10 20.5h4" />
    </Svg>
  );
}

export function ScanIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1" />
    </Svg>
  );
}

export function MoreIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </Svg>
  );
}

export function ChevronIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function BackIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

export function CloseIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function CopyIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </Svg>
  );
}

export function ShareIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M12 15V4M8 8l4-4 4 4M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
    </Svg>
  );
}

export function ChainIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </Svg>
  );
}

export function PersonIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}

export function PhoneIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 17.5h2" />
    </Svg>
  );
}

export function BankIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M3.5 9.5 12 4.5l8.5 5M5.5 10v7M10 10v7M14 10v7M18.5 10v7M4 19.5h16" />
    </Svg>
  );
}

export function NearIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M6 18V6l12 12V6" />
    </Svg>
  );
}

export function BoltIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6z" />
    </Svg>
  );
}

export function DropIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M12 3.5s6 6.5 6 10.5a6 6 0 0 1-12 0c0-4 6-10.5 6-10.5z" />
    </Svg>
  );
}

export function TvIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <rect x="3" y="5.5" width="18" height="12" rx="2" />
      <path d="M8.5 20.5h7M9 2.5l3 3 3-3" />
    </Svg>
  );
}

export function SignalIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M5 19v-3M10 19v-6M15 19v-9M20 19V6" />
    </Svg>
  );
}

export function CheckIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function ShieldIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z" />
    </Svg>
  );
}
