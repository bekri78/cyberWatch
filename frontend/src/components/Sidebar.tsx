import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { Icon } from './Icon';

const NAV = [
  { path: '/situation', label: 'Situation', icon: 'brain' as const, enabled: true },
  { path: '/carte', label: 'Carte', icon: 'globe' as const, enabled: true },
  { path: '/assistant', label: 'Assistant', icon: 'sparkles' as const, enabled: false },
];

const NAV_ITEM_BASE =
  'relative flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-[9px] text-left text-[12.5px] font-normal transition-colors max-[900px]:justify-center';

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="flex w-[208px] shrink-0 flex-col border-r border-border-standard bg-panel max-[900px]:w-14">
      <div className="flex items-center gap-[9px] border-b border-border-subtle px-4 pt-4 pb-3.5 no-underline">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-[rgba(113,112,255,0.35)] bg-[linear-gradient(135deg,rgba(113,112,255,0.3),rgba(94,106,210,0.1))]">
          <Icon name="shield" size={16} color="var(--accent-hover)" />
        </div>
        <div className="max-[900px]:hidden">
          <div className="text-sm font-bold tracking-[0.02em] text-primary">CYBERWATCH</div>
          <div className="mt-0.5 text-[8.5px] font-semibold tracking-[0.18em] text-accent">VEILLE OSINT</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-px p-2">
        {NAV.map((item) => {
          const active = location.pathname === item.path;
          const className = cn(
            NAV_ITEM_BASE,
            active &&
              'bg-[var(--s3)] font-[510] text-primary before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[2.5px] before:rounded-sm before:bg-accent before:content-[""]',
            !active && item.enabled && 'text-tertiary hover:bg-[var(--s2)] hover:text-secondary',
            !item.enabled && 'cursor-default text-quaternary hover:bg-transparent hover:text-quaternary',
          );
          const content = (
            <>
              <Icon name={item.icon} size={15} color={active ? 'var(--accent)' : 'currentColor'} />
              <span className="max-[900px]:hidden">{item.label}</span>
              {!item.enabled && (
                <span className="ml-auto rounded-[4px] border border-border-standard bg-[var(--s2)] px-[5px] py-px text-[9px] font-semibold tracking-[0.06em] text-quaternary uppercase max-[900px]:hidden">
                  Bientot
                </span>
              )}
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

      <div className="border-t border-border-subtle p-3.5">
        <div className="inline-flex w-full items-center justify-center gap-1 rounded-[5px] border border-border-standard bg-[var(--s2)] px-2 py-[3px] text-[11px] whitespace-nowrap text-tertiary">
          <Icon name="satellite" size={12} />
          <span className="max-[900px]:hidden">Sources OSINT publiques</span>
        </div>
      </div>
    </aside>
  );
}
