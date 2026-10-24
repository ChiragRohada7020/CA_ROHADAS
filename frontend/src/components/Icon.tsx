/**
 * Inline icons.
 *
 * Hand-written SVG rather than an icon dependency: there are a dozen of them, they are
 * all simple strokes, and adding a package for this would mean tracking its versions and
 * its tree-shaking for no benefit.
 *
 * Every icon draws with `currentColor` at a 20px nominal size, so an icon inherits the
 * colour of whatever it sits in — which is what makes the circular chips work without a
 * second colour prop.
 */

export type IconName =
  | "dashboard"
  | "clients"
  | "tasks"
  | "compliance"
  | "audit"
  | "documents"
  | "billing"
  | "receivables"
  | "team"
  | "calendar"
  | "reports"
  | "communications"
  | "integrations"
  | "settings"
  | "search"
  | "plus"
  | "bell"
  | "chevron-down"
  | "chevron-right"
  | "chevron-left"
  | "arrow-right"
  | "clock"
  | "check-circle"
  | "circle-dot"
  | "alert-triangle"
  | "file-text"
  | "building"
  | "logout"
  | "user"
  | "tag"
  | "upload"
  | "download"
  | "share"
  | "trash"
  | "pencil"
  | "folder"
  | "folder-open"
  | "more-vertical"
  | "x"
  | "link"
  | "eye"
  | "history"
  | "filter"
  | "crown"
  | "users-round"
  | "building-2"
  | "graduation-cap"
  | "user-round"
  | "shield-check"
  | "receipt"
  | "wallet"
  | "calendar-days"
  | "chart-no-axes"
  | "briefcase-business"
  | "messages-square"
  | "chevron-up"
  | "fullscreen"
  | "assistant"
  | "qrcode"
  | "whatsapp"
  | "envelope"
  | "send"
  | "clock-3"
  | "x-circle"
  | "alert-circle"
  | "info"
  | "copy"
  | "smile"
  | "bookmark";

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  clients: (
    <>
      <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
      <circle cx="10" cy="8" r="3.25" />
      <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.38" />
      <path d="M15.5 5.13a3.25 3.25 0 0 1 0 5.74" />
    </>
  ),
  tasks: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M8.5 12.2l2.2 2.2 4.8-4.8" />
    </>
  ),
  compliance: (
    <>
      <path d="M12 3l7.5 3v5.2c0 4.3-3 8.2-7.5 9.8-4.5-1.6-7.5-5.5-7.5-9.8V6z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  audit: (
    <>
      <path d="M12 3L3 9v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9L12 3z" />
      <path d="M9 14l2 2 4-4" />
    </>
  ),
  documents: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  billing: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9.5 8h5M9.5 12h5" />
    </>
  ),
  receivables: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M14.5 10a2.5 2.5 0 0 0-2.5-1.6c-1.4 0-2.4.8-2.4 1.9s.9 1.7 2.4 2c1.6.3 2.6.9 2.6 2s-1.1 2-2.6 2A2.6 2.6 0 0 1 9.4 15" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19.5v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1" />
      <path d="M16.5 5.3a3.2 3.2 0 0 1 0 5.4M18 19.5v-1a4 4 0 0 0-1.6-3.2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5V6M16 3.5V6" />
    </>
  ),
  reports: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  communications: (
    <>
      <path d="M20.5 12c0 4.1-3.8 7.4-8.5 7.4a10 10 0 0 1-2.8-.4L4.5 20.5l1.3-3.6A7 7 0 0 1 3.5 12C3.5 7.9 7.3 4.6 12 4.6s8.5 3.3 8.5 7.4z" />
    </>
  ),
  integrations: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <path d="M17 13.5v7M13.5 17h7" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9L5.3 5.3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5z" />
      <path d="M13.7 19a2 2 0 0 1-3.4 0" />
    </>
  ),
  "chevron-down": (
    <>
      <path d="M6 9.5l6 6 6-6" />
    </>
  ),
  "chevron-right": (
    <>
      <path d="M9.5 6l6 6-6 6" />
    </>
  ),
  "chevron-left": (
    <>
      <path d="M14.5 6l-6 6 6 6" />
    </>
  ),
  "arrow-right": (
    <>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
    </>
  ),
  "circle-dot": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </>
  ),
  tag: (
    <>
      <path d="M11.6 3.5H20v8.4l-8.7 8.7a1.6 1.6 0 0 1-2.3 0l-6.1-6.1a1.6 1.6 0 0 1 0-2.3z" />
      <circle cx="16.2" cy="7.8" r="1.4" />
    </>
  ),
  "alert-triangle": (
    <>
      <path d="M12 4.5L21 19.5H3z" />
      <path d="M12 10v4M12 16.8v.2" />
    </>
  ),
  "file-text": (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21" />
      <path d="M14 10h4.5A1.5 1.5 0 0 1 20 11.5V21" />
      <path d="M3 21h18M7 8h4M7 12h4M7 16h4" />
    </>
  ),
  logout: (
    <>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
    </>
  ),
  upload: (
    <>
      <path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16" />
      <path d="M12 15V3.5M7.5 8L12 3.5 16.5 8" />
    </>
  ),
  download: (
    <>
      <path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16" />
      <path d="M12 3.5V15M7.5 10.5L12 15l4.5-4.5" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4A1.3 1.3 0 0 1 14.5 4.8V7" />
      <path d="M6.5 7l.9 12.1A1.9 1.9 0 0 0 9.3 21h5.4a1.9 1.9 0 0 0 1.9-1.9L17.5 7" />
      <path d="M10.5 11v6M13.5 11v6" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),
  folder: (
    <>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.2a2 2 0 0 1 1.6.8l1 1.4h7.2a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    </>
  ),
  "folder-open": (
    <>
      <path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h3.2a2 2 0 0 1 1.6.8l1 1.4h7.2a2 2 0 0 1 2 2v1" />
      <path d="M3.5 8.5V18a2 2 0 0 0 2 2h12.3a2 2 0 0 0 1.9-1.4l1.6-5.2a1 1 0 0 0-1-1.4H6.2a2 2 0 0 0-1.9 1.4z" />
    </>
  ),
  "more-vertical": (
    <>
      <circle cx="12" cy="5.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  x: (
    <>
      <path d="M6 6l12 12M18 6L6 18" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.54 3.54 0 0 0-5-5l-1.2 1.2" />
      <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.54 3.54 0 0 0 5 5l1.2-1.2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5V10H9" />
      <path d="M12 8v4.3l3 1.8" />
    </>
  ),
  filter: (
    <>
      <path d="M3.5 5.5h17l-6.5 7.5V19l-4 1.5v-7.5z" />
    </>
  ),
  crown: (
    <>
      <path d="M12 2L15.09 8.26H22l-2.57 2.57L19.18 15l-1.24 5.01L12 18l-5.94-3.24L4.82 15 7.39 12.83 2.57 10.83H8.91z" />
    </>
  ),
  "users-round": (
    <>
      <circle cx="10" cy="8" r="3" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <circle cx="18" cy="8" r="3" />
      <path d="M16 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
    </>
  ),
  "building-2": (
    <>
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21" />
      <path d="M14 10h4.5A1.5 1.5 0 0 1 20 11.5V21" />
      <path d="M3 21h18M7 8h4M7 12h4M7 16h4" />
    </>
  ),
  "graduation-cap": (
    <>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7" />
      <path d="M7 11V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7" />
      <path d="M5 11h14" />
    </>
  ),
  "user-round": (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M6 21v-2a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6v2" />
    </>
  ),
  "shield-check": (
    <>
      <path d="M12 2L3 7v5a8 8 0 0 0 8 8 8 8 0 0 0 8-8V7z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 6h6M9 10h4M9 14h6M9 18h4" />
    </>
  ),
  wallet: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M12 12h4M12 16h2" />
      <circle cx="7" cy="12" r="1" fill="currentColor" />
      <circle cx="17" cy="16" r="1" fill="currentColor" />
    </>
  ),
  "calendar-days": (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18M8 8V4M16 8V4M3 21h18" />
    </>
  ),
  "chart-no-axes": (
    <>
      <path d="M22 12H4v8l8-6 8 6V12z" />
      <path d="M4 12h8l4-4 4 4h8" />
    </>
  ),
  "briefcase-business": (
    <>
      <rect x="3" y="3" width="7" height="5" rx="1" />
      <path d="M10 3h7v11l-3.5-2L10 14z" />
      <path d="M14 8h-4" />
    </>
  ),
  "messages-square": (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <polyline points="16 17 14 19 10 15" />
      <line x1="8" x2="8" y1="9" y2="9" />
    </>
  ),
  "chevron-up": (
    <path d="M18 15l-6-6-6 6" />
  ),
  fullscreen: (
    <>
      <path d="M4 16V4h4" />
      <path d="M5 5l5 5" />
      <path d="M20 8v8a2 2 0 0 1-2 2h-8" />
      <path d="M19 19l-5-5" />
    </>
  ),
  assistant: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v4" />
      <path d="M2 12h4" />
      <path d="M9 8l3 3-3 3" />
      <path d="M19 5l-3 7 3 5" />
    </>
  ),
  qrcode: (
    <>
      <rect x="3" y="3" width="5" height="5" rx="0.5" />
      <rect x="16" y="3" width="5" height="5" rx="0.5" />
      <rect x="3" y="16" width="5" height="5" rx="0.5" />
      <rect x="16" y="16" width="5" height="5" rx="0.5" />
      <path d="M8 5v5H3m13 0v5h-5M8 8h5" />
      <path d="M16 8h5" />
      <path d="M3 13h5v5m8-5h5v5" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M9.83 14.17a1.5 1.5 0 0 0 2 2 3.83 3.83 0 0 1-2.17-2.17 1 1 0 0 1 1-1A1 1 0 0 1 12 13a3 3 0 0 0 .13 1.1 1 1 0 0 1-.13.9 1 1 0 0 1-1-.13 2.17 2.17 0 0 1-.75-.75 1 1 0 1 1 1.79-1.1Z" />
      <path d="M12 2a9.95 9.95 0 0 0-8 4 13.1 13.1 0 0 0 0 8 9.8 9.8 0 0 0 5 8.5A9.9 9.9 0 0 0 12 22a9.82 9.82 0 0 0 8-3.4 13 13 0 0 0 2.65-3.4 9.85 9.85 0 0 0 1.35-5 9.83 9.83 0 0 0-3.4-7.36A9.95 9.95 0 0 0 12 2Z" />
      <path d="M15.55 12.55a3.82 3.82 0 0 0 0-3.1 1.4 1.4 0 0 1-1-1.34 1.39 1.39 0 0 1 1.44-1.3 3.76 3.76 0 0 1 1.72.5 3.93 3.93 0 0 1 1.44 1.95 1.42 1.42 0 0 1 .32 1 1.4 1.4 0 0 1-1.4 1.42 1.42 1.42 0 0 1-.79-.3 2.49 2.49 0 0 0-.65-.6 1 1 0 0 0-.77.86v.2a3.8 3.8 0 0 1 0 2.3 1 1 0 0 1-1.3.68 3.84 3.84 0 0 0-.8 1.3 1 1 0 0 1-.78.79 1 1 0 0 1-1.1-.3 3.76 3.76 0 0 1-.34-.82 1 1 0 0 1 .15-.91Z" />
    </>
  ),
  envelope: (
    <>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z" />
      <path d="M22 6l-10 7-10-7" />
    </>
  ),
  send: (
    <>
      <path d="M22 2L11 13l-5-5-9 8v4h4l14-12Z" />
      <path d="M16 4l6 6-6 6" />
    </>
  ),
  "clock-3": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  "x-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </>
  ),
  "alert-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9c.5 1 2.5 1 3 0" />
      <path d="M9 15c1.5 1 4.5 2 6 0" />
      <circle cx="9" cy="9" r="1" fill="currentColor" />
      <circle cx="15" cy="9" r="1" fill="currentColor" />
    </>
  ),
  bookmark: (
    <>
      <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </>
  ),
};

export function Icon({
  name,
  className = "h-5 w-5",
  strokeWidth = 1.7,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
