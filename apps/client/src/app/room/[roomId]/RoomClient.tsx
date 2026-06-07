'use client';

import { useSearchParams } from 'next/navigation';
import { TableScene } from '../../../components/scene/TableScene';

interface RoomClientProps {
  roomId: string;
}

export function RoomClient({ roomId }: RoomClientProps) {
  const params = useSearchParams();
  const displayName = params.get('name') ?? 'Player';
  return <TableScene roomId={roomId} displayName={displayName} />;
}
