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
    <header className="cw-header">
      <div className="cw-header-title">{title}</div>
      {subtitle && <span className="cw-header-sub cw-masquable">{subtitle}</span>}
      <div className="cw-header-spacer" />
      {status && <span className="cw-header-status cw-masquable">{status}</span>}
    </header>
  );
}
