'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_CHAT_LENGTH, QUICK_CHAT_MESSAGES, QUICK_EMOJIS } from '@faceless-spectre/shared';
import { useRoomStore } from '../../store/roomStore';
import { palette, font } from '../../theme/palette';
import { Icon } from '../ui/Icon';

interface ChatPanelProps {
  /** Sends a chat line to the server (trims + ignores empties internally). */
  sendChat: (text: string) => void;
}

/**
 * In-room chat: a scrolling log plus a composer with free text, one-tap quick
 * phrases, and one-tap emoji. Everything is sent as plain text — the server
 * resolves the sender name, sanitizes, and rate-limits. Voice lives elsewhere
 * (Discord); this is the in-table back-channel.
 */
export function ChatPanel({ sendChat }: ChatPanelProps) {
  const chatLog = useRoomStore((s) => s.chatLog);
  const localPlayerId = useRoomStore((s) => s.localPlayerId);

  const [text, setText] = useState('');
  const [open, setOpen] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Stick to the newest message as the log grows.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatLog, open]);

  function submit() {
    const t = text.trim();
    if (!t) return;
    sendChat(t);
    setText('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Keep typing local — Enter sends, and we stop propagation so the table's
    // global hotkeys (draw/deal/shuffle) never fire while composing.
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  if (!open) {
    return (
      <button style={styles.fab} onClick={() => setOpen(true)} title="Open chat">
        <Icon name="message" size={16} />
        {chatLog.length > 0 && <span style={styles.fabCount}>{chatLog.length}</span>}
      </button>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>
          <Icon name="message" size={13} /> Chat
        </span>
        <button style={styles.collapseBtn} onClick={() => setOpen(false)} title="Hide chat">
          <Icon name="chevron-down" size={14} />
        </button>
      </div>

      <div ref={logRef} style={styles.log}>
        {chatLog.length === 0 ? (
          <div style={styles.empty}>No messages yet — say hello 👋</div>
        ) : (
          chatLog.map((m) => {
            const mine = m.fromId === localPlayerId;
            return (
              <div key={m.id} style={styles.line}>
                <span style={{ ...styles.author, color: mine ? palette.hearth : palette.arcane }}>
                  {mine ? 'You' : m.fromName}
                </span>
                <span style={styles.body}>{m.text}</span>
              </div>
            );
          })
        )}
      </div>

      {/* One-tap quick phrases — send immediately. */}
      <div style={styles.quickRow}>
        {QUICK_CHAT_MESSAGES.map((q) => (
          <button key={q} style={styles.quickBtn} onClick={() => sendChat(q)} title={`Send "${q}"`}>
            {q}
          </button>
        ))}
      </div>

      {/* Emoji tray — appended to the composer so you can stack them. */}
      {showEmoji && (
        <div style={styles.emojiRow}>
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              style={styles.emojiBtn}
              onClick={() => setText((t) => (t + e).slice(0, MAX_CHAT_LENGTH))}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <div style={styles.composer}>
        <button
          style={styles.emojiToggle}
          onClick={() => setShowEmoji((v) => !v)}
          title="Emoji"
        >
          <Icon name="smile" size={16} />
        </button>
        <input
          style={styles.input}
          value={text}
          maxLength={MAX_CHAT_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message…"
          aria-label="Chat message"
        />
        <button style={styles.sendBtn} onClick={submit} disabled={!text.trim()} title="Send">
          <Icon name="send" size={15} />
        </button>
      </div>
    </div>
  );
}

const glassPanel: React.CSSProperties = {
  background: palette.glass,
  border: `1px solid ${palette.glassBorder}`,
  backdropFilter: 'blur(6px)',
  borderRadius: 8,
};

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    width: 300,
    maxWidth: 'calc(100vw - 24px)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.ui,
    ...glassPanel,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    borderBottom: `1px solid ${palette.glassBorder}`,
  },
  headerTitle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    letterSpacing: 0.5,
    color: palette.textPrimary,
  },
  collapseBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    border: 'none',
    background: 'transparent',
    color: palette.textDim,
    cursor: 'pointer',
    padding: 2,
  },
  log: {
    maxHeight: 220,
    minHeight: 64,
    overflowY: 'auto',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    fontSize: 13,
    lineHeight: 1.35,
  },
  empty: { color: palette.textFaint, fontSize: 12, fontStyle: 'italic' },
  line: { color: palette.textPrimary, wordBreak: 'break-word' },
  author: { fontWeight: 600, marginRight: 6, fontSize: 12 },
  body: { color: palette.textPrimary },
  quickRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
    padding: '6px 10px',
    borderTop: `1px solid ${palette.glassBorder}`,
  },
  quickBtn: {
    padding: '3px 8px',
    fontSize: 11,
    borderRadius: 12,
    border: `1px solid ${palette.glassBorder}`,
    background: 'rgba(247,239,225,0.06)',
    color: palette.textDim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  emojiRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    padding: '6px 10px 0',
  },
  emojiBtn: {
    fontSize: 18,
    lineHeight: 1,
    padding: '2px 4px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
  },
  composer: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderTop: `1px solid ${palette.glassBorder}`,
  },
  emojiToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    border: 'none',
    background: 'transparent',
    color: palette.textDim,
    cursor: 'pointer',
    padding: 2,
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: '6px 8px',
    fontSize: 13,
    fontFamily: font.ui,
    color: palette.textPrimary,
    background: 'rgba(0,0,0,0.25)',
    border: `1px solid ${palette.glassBorder}`,
    borderRadius: 6,
    outline: 'none',
  },
  sendBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 8px',
    borderRadius: 6,
    border: `1px solid ${palette.glassBorder}`,
    background: 'rgba(247,239,225,0.08)',
    color: palette.hearth,
    cursor: 'pointer',
  },
  fab: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    color: palette.textPrimary,
    cursor: 'pointer',
    ...glassPanel,
  },
  fabCount: {
    fontSize: 11,
    fontFamily: font.mono,
    color: palette.hearth,
  },
};
