'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { TableScene } from '../../../components/scene/TableScene';

export function RoomClient() {
  // Read roomId from the actual browser URL path at runtime.
  // CF Pages rewrites /room/<id> → the pre-rendered placeholder page, so
  // params.roomId would be the placeholder string. usePathname() gives the
  // real URL the user is visiting, from which we extract the actual room ID.
  const pathname = usePathname();
  const roomId = pathname.split('/').filter(Boolean).pop() ?? '';
  const searchParams = useSearchParams();
  const displayName = searchParams.get('name') ?? 'Player';
  const spectate = searchParams.get('spectate') === '1';
  return <TableScene roomId={roomId} displayName={displayName} spectate={spectate} />;
}
