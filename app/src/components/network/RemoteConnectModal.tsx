import { useState, useEffect } from 'react';
import { create } from 'zustand';
import { Smartphone, QrCode, Copy, Check, X, Wifi } from 'lucide-react';

interface RemoteModalStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useRemoteModal = create<RemoteModalStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

export function RemoteConnectModal() {
  const { isOpen, close } = useRemoteModal();
  const [remoteInfo, setRemoteInfo] = useState<{ ip: string; port: number; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const ep = (window as unknown as { electronPlatform?: { getRemoteInfo?: () => Promise<{ ip: string; port: number; url: string } | null> } }).electronPlatform;
    if (ep?.getRemoteInfo) {
      ep.getRemoteInfo().then((info) => {
        if (info) setRemoteInfo(info);
      });
    } else {
      // Browser fallback
      setRemoteInfo({ ip: 'localhost', port: 2424, url: 'http://localhost:2424' });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const url = remoteInfo?.url || 'http://localhost:2424';

  const copyUrl = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="SudinChord Phone Remote Control"
    >
      <div
        className="relative flex w-full max-w-[420px] flex-col items-center rounded-[28px] border border-white/12 bg-[#12141c]/98 p-6 text-center shadow-2xl backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex size-12 items-center justify-center rounded-2xl bg-[#fa233b]/15 text-[#fa233b] border border-[#fa233b]/30 shadow-lg mb-3">
          <Smartphone size={24} />
        </div>

        <h2 className="text-lg font-bold text-white tracking-wide">Phone Remote Control</h2>
        <p className="text-xs text-white/50 mt-1 max-w-xs">
          Control SudinChord from your phone, tablet, or couch over local Wi-Fi with zero app install required.
        </p>

        {/* QR Code Card */}
        <div className="mt-5 p-3 rounded-2xl bg-white/[0.04] border border-white/10 shadow-inner flex flex-col items-center">
          <img
            src={`http://127.0.0.1:${remoteInfo?.port || 2424}/qr.svg`}
            alt="Scan QR to Connect"
            className="size-48 rounded-xl shadow-md border border-white/10 bg-[#181a24]"
            onError={(e) => {
              // Fallback styling if server is in browser mode
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
            <Wifi size={13} />
            <span>Connect to same Wi-Fi network</span>
          </div>
        </div>

        {/* Connect URL copy box */}
        <div className="mt-4 flex w-full items-center justify-between gap-2 rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2">
          <span className="font-mono text-xs text-white/80 truncate">{url}</span>
          <button
            type="button"
            onClick={copyUrl}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors cursor-pointer flex-none"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <button
          onClick={close}
          className="mt-5 w-full rounded-full h-9 bg-white text-xs font-semibold text-black hover:bg-white/90 transition-all cursor-pointer shadow-md"
        >
          Done
        </button>
      </div>
    </div>
  );
}
