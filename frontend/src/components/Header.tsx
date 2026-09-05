export function Header({
  title,
  subtitle,
  status,
}: {
  title: string;
  subtitle?: string;
  status?: string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3.5 border-b border-border-standard bg-[rgba(15,16,17,0.75)] px-[22px] backdrop-blur-md">
      <div className="shrink-0 text-[13.5px] font-[590] tracking-[-0.1px] text-primary">{title}</div>
      {subtitle && <span className="max-[760px]:hidden text-xs text-quaternary">{subtitle}</span>}
      <div className="flex-1" />
      {status && (
        <span className="max-[760px]:hidden inline-flex items-center gap-[7px] text-[11.5px] text-tertiary">
          {status}
        </span>
      )}
    </header>
  );
}
