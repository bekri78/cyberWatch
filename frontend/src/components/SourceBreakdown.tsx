import { SOURCE_META } from '../domain';
import { cn } from '../lib/utils';

interface SourceBreakdownProps {
  /** Nombre reel d'evenements renvoyes par source (cf. useDiversifiedEvents.countsBySource). */
  counts: Record<string, number>;
  /** Sources dont le compte est plafonne par la limite de requete -- le vrai total est superieur. */
  cappedSources: string[];
  /** Sources interrogees sans collecteur reel implemente (toujours 0). */
  emptySources: string[];
  /** Total apres fusion/deduplication, pour le chip "Toutes les sources". */
  total: number;
  activeFilter: string | null;
  onFilterChange: (tag: string | null) => void;
}

const CHIP_BASE =
  'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors';

/**
 * Legende ET filtre en un seul composant : chaque source reellement
 * enregistree (SOURCE_META) devient un chip cliquable qui affiche son vrai
 * compte (echantillonne, cf. countsBySource) et bascule le filtre de la
 * liste "Derniers evenements". Les sources sans collecteur reel (toujours 0)
 * restent visibles mais desactivees, plutot que masquees -- ca montre
 * explicitement pourquoi elles sont vides au lieu de le laisser deviner.
 */
export function SourceBreakdown({
  counts,
  cappedSources,
  emptySources,
  total,
  activeFilter,
  onFilterChange,
}: SourceBreakdownProps) {
  const tags = Object.keys(SOURCE_META);

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par source">
      <button
        type="button"
        onClick={() => onFilterChange(null)}
        className={cn(
          CHIP_BASE,
          activeFilter === null
            ? 'border-[rgba(113,112,255,0.4)] bg-[rgba(113,112,255,0.15)] text-primary'
            : 'border-border-standard bg-transparent text-tertiary hover:bg-[var(--s2)] hover:text-secondary',
        )}
      >
        Toutes les sources
        <span className="text-quaternary">· {total}</span>
      </button>

      {tags.map((tag) => {
        const meta = SOURCE_META[tag];
        const count = counts[tag] ?? 0;
        const isEmpty = emptySources.includes(tag);
        const isCapped = cappedSources.includes(tag);
        const active = activeFilter === tag;

        return (
          <button
            key={tag}
            type="button"
            disabled={isEmpty}
            onClick={() => onFilterChange(active ? null : tag)}
            title={isEmpty ? 'Aucun collecteur implemente pour cette source -- toujours vide' : undefined}
            className={cn(
              CHIP_BASE,
              isEmpty && 'cursor-not-allowed border-border-subtle text-quaternary opacity-45',
              !isEmpty &&
                !active &&
                'border-border-standard bg-transparent text-tertiary hover:bg-[var(--s2)] hover:text-secondary',
              !isEmpty && active && 'border-transparent text-primary',
            )}
            style={!isEmpty && active ? { backgroundColor: `${meta.color}26`, borderColor: `${meta.color}66` } : undefined}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
            {meta.label}
            <span className="text-quaternary">
              · {isEmpty ? '0' : count}
              {isCapped ? '+' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
