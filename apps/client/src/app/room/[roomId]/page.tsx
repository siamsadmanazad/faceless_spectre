import { Suspense } from 'react';
import { RoomClient } from './RoomClient';

interface PageProps {
  params: { roomId: string };
}

export default function RoomPage({ params }: PageProps) {
  return (
    <Suspense>
      <RoomClient roomId={params.roomId} />
    </Suspense>
  );
}
