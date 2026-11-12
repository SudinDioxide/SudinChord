import { Moon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Menu, MenuHeader, MenuItem, MenuSeparator, type MenuPlacement } from '@/components/Menu';
import { formatSleepRemaining, useSleepTimer, type SleepTimerMode } from '@/state/sleepTimer';

interface SleepTimerButtonProps {
  className?: string;
  placement?: MenuPlacement;
}

export function SleepTimerButton({ className = '', placement = 'above-end' }: SleepTimerButtonProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const mode = useSleepTimer((s) => s.mode);
  const remainingSec = useSleepTimer((s) => s.remainingSec);
  const setTimer = useSleepTimer((s) => s.setTimer);

  const close = useCallback(() => setAnchor(null), []);

  const select = (m: SleepTimerMode) => {
    setTimer(m);
    close();
  };

  const isActive = mode !== 'off';
  const label =
    mode === 'end-of-track'
      ? 'Sleep: End of track'
      : isActive
        ? `Sleep: ${formatSleepRemaining(remainingSec)}`
        : 'Sleep Timer';

  const badgeText =
    mode === 'end-of-track'
      ? 'End'
      : remainingSec !== null && remainingSec > 0
        ? remainingSec >= 60
          ? `${Math.ceil(remainingSec / 60)}m`
          : `${remainingSec}s`
        : null;

  return (
    <>
      <button
        className={`relative grid size-8 place-items-center rounded-full transition-all duration-120 ease-in hover:bg-quinary ${
          isActive ? 'text-[#ff0033]' : 'text-secondary hover:text-primary'
        } ${className}`}
        aria-haspopup="menu"
        aria-label={label}
        title={label}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <Moon size={18} strokeWidth={2.2} fill={isActive ? 'currentColor' : 'none'} />
        {badgeText && (
          <span className="pointer-events-none absolute -bottom-1 -right-1 rounded bg-[#ff0033] px-1 py-0.2 text-[8px] font-bold text-white shadow-sm">
            {badgeText}
          </span>
        )}
      </button>

      {anchor && (
        <Menu anchor={anchor} placement={placement} onClose={close} label="Sleep Timer">
          <MenuHeader>Sleep Timer</MenuHeader>
          <MenuItem onSelect={() => select('off')} checked={mode === 'off'}>
            Off
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => select('15m')} checked={mode === '15m'}>
            15 minutes
          </MenuItem>
          <MenuItem onSelect={() => select('30m')} checked={mode === '30m'}>
            30 minutes
          </MenuItem>
          <MenuItem onSelect={() => select('45m')} checked={mode === '45m'}>
            45 minutes
          </MenuItem>
          <MenuItem onSelect={() => select('60m')} checked={mode === '60m'}>
            1 hour
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => select('end-of-track')} checked={mode === 'end-of-track'}>
            End of current track
          </MenuItem>
        </Menu>
      )}
    </>
  );
}

