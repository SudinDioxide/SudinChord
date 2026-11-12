import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router';

/** The page title row (report §1, `.header-nav`). */
export function PageHeader({ title, showBack = true }: { title: string; showBack?: boolean }) {
  const navigate = useNavigate();

  const handleBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      navigate(-1);
    } else {
      navigate('/home');
    }
  };

  return (
    <div className="mx-(--body-gutter) pt-8 flex items-center gap-3.5">
      {showBack && (
        <button
          type="button"
          onClick={handleBack}
          className="grid size-9 place-items-center rounded-full bg-white/5 hover:bg-white/15 text-primary active:scale-95 transition-all cursor-pointer"
          title="Go back"
          aria-label="Go back"
        >
          <ChevronLeft size={20} strokeWidth={2.2} />
        </button>
      )}
      <h1 className="type-header-emphasized">{title}</h1>
    </div>
  );
}
