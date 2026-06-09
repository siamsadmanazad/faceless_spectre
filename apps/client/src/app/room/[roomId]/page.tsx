import { Suspense } from 'react';
import { RoomClient } from './RoomClient';

// Static export requires all dynamic routes to have pre-generated paths.
// We export a single placeholder path; Cloudflare Pages rewrites /room/* to
// this page (see public/_redirects), and RoomClient reads the real ID from
// usePathname() at runtime so the actual room ID is always used.
export function generateStaticParams() {
  return [{ roomId: '__room__' }];
}

export default function RoomPage() {
  return (
    <Suspense>
      <RoomClient />
    </Suspense>
  );
}
