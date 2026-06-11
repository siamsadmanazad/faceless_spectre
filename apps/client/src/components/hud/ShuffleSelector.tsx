'use client';

import { useState, useEffect } from 'react';
import { ShuffleStyle, ShuffleIntensity } from '@faceless-spectre/shared';
import { palette } from '../../theme/palette';

interface ShuffleSelectorProps {
  open: boolean;
  onConfirm: (style: ShuffleStyle, intensity: ShuffleIntensity) => void;
  onClose: () => void;
}

const STYLE_LABELS: Record<ShuffleStyle, string> = {
  [ShuffleStyle.Overhand]: 'Overhand',
  [ShuffleStyle.Riffle]: 'Riffle',
  [ShuffleStyle.Wash]: 'Wash',
  [ShuffleStyle.Split]: 'Split',
  [ShuffleStyle.Casino]: 'Casino',
};

const INTENSITY_LABELS: Record<ShuffleIntensity, string> = {
  [ShuffleIntensity.Low]: 'Low',
  [ShuffleIntensity.Medium]: 'Medium',
  [ShuffleIntensity.High]: 'High',
};

export function ShuffleSelector({ open, onConfirm, onClose }: ShuffleSelectorProps) {
  const [selectedStyle, setSelectedStyle] = useState<ShuffleStyle>(ShuffleStyle.Riffle);
  const [selectedIntensity, setSelectedIntensity] = useState<ShuffleIntensity>(ShuffleIntensity.Medium);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') onConfirm(selectedStyle, selectedIntensity);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onConfirm, selectedStyle, selectedIntensity]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <p style={styles.title}>How do you want to shuffle?</p>

        <p style={styles.sectionLabel}>Style</p>
        <div style={styles.row}>
          {(Object.values(ShuffleStyle) as ShuffleStyle[]).map((s) => (
            <button
              key={s}
              style={s === selectedStyle ? { ...styles.btn, ...styles.btnActive } : styles.btn}
              onClick={() => setSelectedStyle(s)}
            >
              {STYLE_LABELS[s]}
            </button>
          ))}
        </div>

        <p style={styles.sectionLabel}>Intensity</p>
        <div style={styles.row}>
          {(Object.values(ShuffleIntensity) as ShuffleIntensity[]).map((i) => (
            <button
              key={i}
              style={i === selectedIntensity ? { ...styles.btn, ...styles.btnActive } : styles.btn}
              onClick={() => setSelectedIntensity(i)}
            >
              {INTENSITY_LABELS[i]}
            </button>
          ))}
        </div>

        <div style={styles.actions}>
          <button style={styles.confirmBtn} onClick={() => onConfirm(selectedStyle, selectedIntensity)}>
            Shuffle <kbd style={styles.kbd}>↵</kbd>
          </button>
          <button style={styles.cancelBtn} onClick={onClose}>
            Cancel <kbd style={styles.kbd}>Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    background: 'rgba(0,0,0,0.4)',
  },
  panel: {
    width: 360,
    background: 'rgba(26,20,16,0.95)',
    border: `1px solid ${palette.glassBorder}`,
    borderRadius: 12,
    padding: '24px 28px',
    fontFamily: 'sans-serif',
    color: palette.textPrimary,
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
  },
  title: {
    margin: '0 0 18px',
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: 0.3,
    color: palette.textPrimary,
  },
  sectionLabel: {
    margin: '0 0 8px',
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: palette.textDim,
  },
  row: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  btn: {
    padding: '7px 14px',
    fontSize: 13,
    background: 'rgba(247,239,225,0.05)',
    color: palette.textDim,
    border: '1px solid rgba(247,239,225,0.12)',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'background 0.12s',
  } as React.CSSProperties,
  btnActive: {
    background: palette.hearth,
    color: palette.bgDeep,
    border: `1px solid ${palette.hearthSoft}`,
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  confirmBtn: {
    padding: '10px 22px',
    fontSize: 14,
    fontWeight: 600,
    background: palette.hearth,
    color: palette.bgDeep,
    border: `1px solid ${palette.hearthSoft}`,
    borderRadius: 8,
    cursor: 'pointer',
  } as React.CSSProperties,
  cancelBtn: {
    padding: '10px 16px',
    fontSize: 13,
    background: 'transparent',
    color: palette.textDim,
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  kbd: {
    fontFamily: 'monospace',
    fontSize: 11,
    background: 'rgba(247,239,225,0.1)',
    padding: '1px 5px',
    borderRadius: 3,
    marginLeft: 6,
  } as React.CSSProperties,
};
