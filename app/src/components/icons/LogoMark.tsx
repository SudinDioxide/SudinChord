export function LogoMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/icon.png"
      alt="SudinChord Logo"
      aria-hidden="true"
      className={className}
      style={{ display: 'inline-block', width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
    />
  );
}
