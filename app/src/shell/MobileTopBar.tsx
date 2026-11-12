import { ChevronLeft, Menu } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { PrefetchLink } from '@/components/PrefetchLink';
import { LogoMark } from '@/components/icons/LogoMark';
import { useUi } from '@/state/ui';

/** Below 484px the sidebar folds into this bar and a drawer (report §11). */
export function MobileTopBar() {
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/' || location.pathname === '/home';

  const handleBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      navigate(-1);
    } else {
      navigate('/home');
    }
  };

  return (
    <header className="hidden max-sm:absolute max-sm:inset-x-0 max-sm:top-0 max-sm:z-[calc(var(--z-web-chrome)-2)] max-sm:grid max-sm:h-(--mobile-top-bar-height) max-sm:grid-cols-[44px_1fr_44px] max-sm:items-center max-sm:px-3.5 max-sm:glass-material">
      <button className="grid size-11 place-items-center rounded-full" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
        <Menu size={22} strokeWidth={2} />
      </button>
      <PrefetchLink to="/home" className="inline-flex items-center gap-1.5 justify-self-center type-[700_16px/20px]" aria-label="SudinChord, Home">
        <LogoMark size={20} className="text-primary" />
        <span>SudinChord</span>
      </PrefetchLink>
      {!isHome ? (
        <button
          className="grid size-11 place-items-center rounded-full text-primary hover:text-white active:scale-95 transition-all cursor-pointer"
          aria-label="Go back"
          title="Go back"
          onClick={handleBack}
        >
          <ChevronLeft size={24} strokeWidth={2.2} />
        </button>
      ) : (
        <span className="w-11" />
      )}
    </header>
  );
}
