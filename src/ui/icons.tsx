/* eslint-disable react-refresh/only-export-components -- the stroke() and filled() factories return components */
import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function stroke(paths: ReactNode) {
  return function StrokeIcon({ size = 18, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

function filled(paths: ReactNode) {
  return function FilledIcon({ size = 18, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const CarIcon = stroke(
  <>
    <path d="M3 16v-3l2.2-5h13.6l2.2 5v3z" />
    <path d="M6 16v2.5M18 16v2.5M3 13h18" />
  </>,
);
export const BikeIcon = stroke(
  <>
    <circle cx="5.5" cy="16" r="3.5" />
    <circle cx="18.5" cy="16" r="3.5" />
    <path d="M5.5 16l4-8h5.5l3.5 8M9.5 8l3.5 8" />
  </>,
);
export const WalkIcon = stroke(
  <>
    <circle cx="13" cy="4.5" r="1.8" />
    <path d="M10 21l2-6-2.5-3 1.5-4.5 3 2.5 3 1M12 15l3 6M9 9l-2.5 3.5" />
  </>,
);
export const SwapIcon = stroke(<path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3" />);
export const EditIcon = stroke(<path d="M4 20h4L19 9l-4-4L4 16z" />);
export const RestartIcon = stroke(<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" />);
export const PlusIcon = stroke(<path d="M12 5v14M5 12h14" />);
export const MinusIcon = stroke(<path d="M5 12h14" />);
export const FitIcon = stroke(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />);
export const ChevronUpIcon = stroke(<path d="M6 15l6-6 6 6" />);
export const ChevronDownIcon = stroke(<path d="M6 9l6 6 6-6" />);
export const MapIcon = stroke(
  <>
    <path d="M9 4L3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5z" />
    <path d="M9 4v13.5M15 6.5V20" />
  </>,
);
export const BookIcon = stroke(
  <>
    <path d="M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5z" />
    <path d="M12 6.5v13" />
  </>,
);
export const PlayIcon = filled(<path d="M7 4.5l13 7.5-13 7.5z" />);
export const PauseIcon = filled(
  <>
    <rect x="6" y="5" width="4" height="14" rx="1.2" />
    <rect x="14" y="5" width="4" height="14" rx="1.2" />
  </>,
);
export const StepBackIcon = filled(
  <>
    <path d="M17 5.5v13L8 12z" />
    <rect x="5" y="5.5" width="2.2" height="13" rx="1" />
  </>,
);
export const StepForwardIcon = filled(
  <>
    <path d="M7 5.5v13l9-6.5z" />
    <rect x="16.8" y="5.5" width="2.2" height="13" rx="1" />
  </>,
);
export const JumpToEndIcon = filled(<path d="M3.5 5.5v13l8-6.5zM12 5.5v13l8-6.5z" />);

export function LogoIcon({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6.5 17L17 7.5M7.5 18.5h8" />
      <circle cx="5" cy="18.5" r="2.5" fill="currentColor" />
      <circle cx="18.5" cy="6" r="2.5" />
      <circle cx="18" cy="18.5" r="2" />
    </svg>
  );
}

/** The A / B badge used on the map and next to place names. */
export function PointBadge({ role, size = 22 }: { role: 'start' | 'target'; size?: number }) {
  const start = role === 'start';
  return (
    <span
      aria-hidden="true"
      style={{
        flex: 'none',
        width: size,
        height: size,
        borderRadius: '50%',
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.55),
        fontWeight: 700,
        background: start ? '#f4f6f8' : 'var(--bg)',
        color: start ? 'var(--bg)' : '#f4f6f8',
        border: start ? 'none' : '2px solid #f4f6f8',
      }}
    >
      {start ? 'A' : 'B'}
    </span>
  );
}
