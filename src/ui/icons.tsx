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
export const CheckIcon = stroke(<path d="M5 12l5 5 9-10" />);
export const LinkIcon = stroke(
  <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
);
export const SparkIcon = stroke(
  <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" />,
);
export const SearchIcon = stroke(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </>,
);
export const ArrowRightIcon = stroke(<path d="M5 12h14M13 6l6 6-6 6" />);
/** Two arrows, one each way: a search from both ends. */
export const BothWaysIcon = stroke(<path d="M4 8h15l-4-4M20 16H5l4 4" />);
export const KeyIcon = stroke(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l9-9M17 6l3 3M15 8l2 2" />
  </>,
);
export const LockIcon = stroke(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
);
export const EyeIcon = stroke(
  <>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const EyeOffIcon = stroke(
  <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
);
export const CloseIcon = stroke(<path d="M6 6l12 12M18 6L6 18" />);
export const WarningIcon = stroke(<path d="M12 3l10 18H2zM12 10v5M12 18v.5" />);
export const InfoIcon = stroke(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.5" />
  </>,
);
export const ExternalIcon = stroke(<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />);
export const ChevronLeftIcon = stroke(<path d="M15 6l-6 6 6 6" />);
export const ChevronRightIcon = stroke(<path d="M9 6l6 6-6 6" />);
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
