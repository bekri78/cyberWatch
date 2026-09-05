import { Link, useLocation } from 'react-router-dom';
import { Icon } from './Icon';

const NAV = [
  { path: '/situation', label: 'Situation', icon: 'brain' as const, enabled: true },
  { path: '/carte', label: 'Carte', icon: 'globe' as const, enabled: true },
  { path: '/assistant', label: 'Assistant', icon: 'sparkles' as const, enabled: false },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="cw-sidebar">
      <div className="cw-sidebar-brand">
        <div className="cw-sidebar-mark">
          <Icon name="shield" size={16} color="var(--accent-hover)" />
        </div>
        <div>
          <div className="cw-sidebar-name">CYBERWATCH</div>
          <div className="cw-sidebar-tag">VEILLE OSINT</div>
        </div>
      </div>

      <nav className="cw-nav">
        {NAV.map((item) => {
          const active = location.pathname === item.path;
          const className = `cw-nav-item ${active ? 'is-active' : ''} ${item.enabled ? '' : 'is-disabled'}`;
          const content = (
            <>
              <Icon name={item.icon} size={15} color={active ? 'var(--accent)' : 'currentColor'} />
              <span>{item.label}</span>
              {!item.enabled && <span className="cw-nav-soon">Bientot</span>}
            </>
          );

          return item.enabled ? (
            <Link key={item.path} to={item.path} className={className}>
              {content}
            </Link>
          ) : (
            <span key={item.path} className={className} aria-disabled="true">
              {content}
            </span>
          );
        })}
      </nav>

      <div className="cw-sidebar-footer">
        <div className="cw-tag" style={{ width: '100%', justifyContent: 'center' }}>
          <Icon name="satellite" size={12} />
          Sources OSINT publiques
        </div>
      </div>
    </aside>
  );
}
