import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

export function useCanGoBack() {
  const location = useLocation();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    setCanGoBack(idx > 0);
  }, [location]);

  return canGoBack;
}

export function NavHistoryButtons({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();

  const handleBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      navigate(-1);
    } else {
      navigate('/home');
    }
  };

  const handleForward = () => {
    navigate(1);
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleBack}
        disabled={!canGoBack}
        className="grid size-7 place-items-center rounded-full bg-white/5 hover:bg-white/15 text-primary active:scale-95 transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
        title="Go back (Alt + ←)"
        aria-label="Go back"
      >
        <ChevronLeft size={16} strokeWidth={2.2} />
      </button>
      <button
        type="button"
        onClick={handleForward}
        className="grid size-7 place-items-center rounded-full bg-white/5 hover:bg-white/15 text-primary active:scale-95 transition-all cursor-pointer"
        title="Go forward (Alt + →)"
        aria-label="Go forward"
      >
        <ChevronRight size={16} strokeWidth={2.2} />
      </button>
    </div>
  );
}

