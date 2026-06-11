'use client';

/**
 * Tiny inline-SVG icon set — no dependency, no network, fully tree-shaken to the
 * paths actually used. Stroke paths are Lucide (MIT). Icons inherit `currentColor`
 * and a 1em size so they sit inline with text and pick up the palette.
 */

export type IconName =
  | 'eye'
  | 'volume'
  | 'volume-off'
  | 'crown'
  | 'zap'
  | 'lock'
  | 'globe'
  | 'pause'
  | 'copy'
  | 'check'
  | 'x'
  | 'ghost'
  | 'music'
  | 'music-off'
  | 'message'
  | 'send'
  | 'smile'
  | 'chevron-down';

const PATHS: Record<IconName, React.ReactNode> = {
  eye: (
    <>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  volume: (
    <>
      <path d="M11 4.7 6 9H2v6h4l5 4.3z" />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19.5 6a9 9 0 0 1 0 12" />
    </>
  ),
  'volume-off': (
    <>
      <path d="M11 4.7 6 9H2v6h4l5 4.3z" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </>
  ),
  crown: (
    <path d="M2 18h20l-2-9-5 4-3-7-3 7-5-4-2 9Z" />
  ),
  zap: (
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </>
  ),
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
  check: <path d="M5 12l5 5L20 6" />,
  x: (
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>
  ),
  ghost: (
    <>
      <path d="M4 21V11a8 8 0 0 1 16 0v10l-3-2-2 2-3-2-3 2-2-2Z" />
      <circle cx="9.5" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="11" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  'music-off': (
    <>
      <path d="M9 18V9m0-4V5l12-2v6" />
      <circle cx="6" cy="18" r="3" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </>
  ),
  message: (
    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z" />
  ),
  send: (
    <>
      <line x1="22" y1="2" x2="11" y2="13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </>
  ),
  'chevron-down': <path d="m6 9 6 6 6-6" />,
};

interface IconProps {
  name: IconName;
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

export function Icon({ name, size = '1em', className, style, ...rest }: IconProps) {
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
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      aria-hidden={rest['aria-label'] ? undefined : true}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
