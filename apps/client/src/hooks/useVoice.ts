'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { Room } from 'colyseus.js';
import {
  IntentType,
  ServerMessageType,
  type WebRTCSignalMessage,
} from '@faceless-spectre/shared';
import { useRoomStore } from '../store/roomStore';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface UseVoiceArgs {
  roomRef: React.RefObject<Room | null>;
  sendIntent: (type: IntentType, payload?: Record<string, unknown>) => void;
}

export function useVoice({ roomRef, sendIntent }: UseVoiceArgs) {
  const localPlayerId = useRoomStore((s) => s.localPlayerId);
  const players = useRoomStore((s) => s.players);
  const isMuted = useRoomStore((s) => s.isMuted);
  const setMuted = useRoomStore((s) => s.setMuted);
  const setAudioEnabled = useRoomStore((s) => s.setAudioEnabled);

  const localStream = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const seenPlayerIds = useRef<Set<string>>(new Set());

  // Request microphone access once on mount
  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStream.current = stream;
        setAudioEnabled(true);
      })
      .catch(() => {
        setAudioEnabled(false);
      });

    const pcs = peerConnections.current;
    return () => {
      active = false;
      localStream.current?.getTracks().forEach((t) => t.stop());
      localStream.current = null;
      pcs.forEach((pc) => pc.close());
      pcs.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helpers — defined before effects that use them
  const createPC = useCallback(
    (peerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      localStream.current?.getTracks().forEach((t) => {
        pc.addTrack(t, localStream.current!);
      });

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          sendIntent(IntentType.WebRTCIce, {
            targetId: peerId,
            candidate: JSON.stringify(candidate),
          });
        }
      };

      pc.ontrack = ({ streams }) => {
        let audio = document.getElementById(`audio-${peerId}`) as HTMLAudioElement | null;
        if (!audio) {
          audio = document.createElement('audio');
          audio.id = `audio-${peerId}`;
          audio.autoplay = true;
          document.body.appendChild(audio);
        }
        audio.srcObject = streams[0];
      };

      peerConnections.current.set(peerId, pc);
      return pc;
    },
    [sendIntent],
  );

  const createOffer = useCallback(
    async (peerId: string) => {
      const pc = createPC(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendIntent(IntentType.WebRTCOffer, {
        targetId: peerId,
        sdp: JSON.stringify(offer),
      });
    },
    [createPC, sendIntent],
  );

  const handleOffer = useCallback(
    async (msg: WebRTCSignalMessage) => {
      const pc = createPC(msg.fromId);
      await pc.setRemoteDescription(JSON.parse(msg.sdp!));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendIntent(IntentType.WebRTCAnswer, {
        targetId: msg.fromId,
        sdp: JSON.stringify(answer),
      });
    },
    [createPC, sendIntent],
  );

  const handleAnswer = useCallback(async (msg: WebRTCSignalMessage) => {
    const pc = peerConnections.current.get(msg.fromId);
    if (pc) await pc.setRemoteDescription(JSON.parse(msg.sdp!));
  }, []);

  const handleIce = useCallback(async (msg: WebRTCSignalMessage) => {
    const pc = peerConnections.current.get(msg.fromId);
    if (pc) await pc.addIceCandidate(JSON.parse(msg.candidate!));
  }, []);

  // Register signal message listeners when room connects
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;

    room.onMessage(ServerMessageType.WebRTCOffer, (msg: WebRTCSignalMessage) => {
      handleOffer(msg).catch(console.error);
    });
    room.onMessage(ServerMessageType.WebRTCAnswer, (msg: WebRTCSignalMessage) => {
      handleAnswer(msg).catch(console.error);
    });
    room.onMessage(ServerMessageType.WebRTCIce, (msg: WebRTCSignalMessage) => {
      handleIce(msg).catch(console.error);
    });
    // No cleanup needed — room.onMessage listeners are removed when the room object is replaced
  }, [roomRef, handleOffer, handleAnswer, handleIce]);

  // Detect new/removed players and manage peer connections
  useEffect(() => {
    if (!localPlayerId) return;

    const currentIds = new Set(players.keys());

    // New players — not yet seen
    currentIds.forEach((playerId) => {
      if (playerId === localPlayerId) return;
      if (seenPlayerIds.current.has(playerId)) return;
      seenPlayerIds.current.add(playerId);
      // Lexicographic rule: lower ID initiates the offer
      if (localPlayerId < playerId) {
        createOffer(playerId).catch(console.error);
      }
    });

    // Players who left — close and clean up
    seenPlayerIds.current.forEach((playerId) => {
      if (!currentIds.has(playerId)) {
        seenPlayerIds.current.delete(playerId);
        const pc = peerConnections.current.get(playerId);
        if (pc) {
          pc.close();
          peerConnections.current.delete(playerId);
        }
        document.getElementById(`audio-${playerId}`)?.remove();
      }
    });
  }, [players, localPlayerId, createOffer]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    localStream.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMuted(next);
  }, [isMuted, setMuted]);

  const audioEnabled = useRoomStore((s) => s.audioEnabled);
  return { isMuted, toggleMute, audioEnabled };
}
