import { Activity, Waves } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Menu, MenuHeader, MenuItem, MenuSeparator, type MenuPlacement } from '@/components/Menu';
import { useVisualizerStore, type VisualizerMode } from './AudioVisualizer';

interface VisualizerButtonProps {
  className?: string;
  placement?: MenuPlacement;
}

export function VisualizerButton({ className = '', placement = 'above-end' }: VisualizerButtonProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const enabled = useVisualizerStore((s) => s.enabled);
  const mode = useVisualizerStore((s) => s.mode);
  const toggleEnabled = useVisualizerStore((s) => s.toggleEnabled);
  const setMode = useVisualizerStore((s) => s.setMode);

  const close = useCallback(() => setAnchor(null), []);

  const select = (newMode: VisualizerMode) => {
    if (!enabled) toggleEnabled();
    setMode(newMode);
    close();
  };

  const handleToggle = () => {
    toggleEnabled();
    close();
  };

  const label = enabled ? `Visualizer (${mode === 'bars' ? 'Bars' : 'Wave'})` : 'Visualizer (Off)';

  return (
    <>
      <button
        className={`grid size-8 place-items-center rounded-full transition-all duration-120 ease-in hover:bg-quinary ${
          enabled ? 'text-[#ff0033]' : 'text-secondary hover:text-primary'
        } ${className}`}
        aria-haspopup="menu"
        aria-label={label}
        title={label}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        {mode === 'wave' ? (
          <Waves size={18} strokeWidth={2.2} />
        ) : (
          <Activity size={18} strokeWidth={2.2} />
        )}
      </button>

      {anchor && (
        <Menu anchor={anchor} placement={placement} onClose={close} label="Audio Spectrum Visualizer">
          <MenuHeader>Audio Visualizer</MenuHeader>
          <MenuItem onSelect={handleToggle} checked={enabled}>
            Enable Visualizer
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => select('bars')} checked={enabled && mode === 'bars'}>
            Spectrum Bars
          </MenuItem>
          <MenuItem onSelect={() => select('wave')} checked={enabled && mode === 'wave'}>
            Liquid Waveform
          </MenuItem>
        </Menu>
      )}
    </>
  );
}

