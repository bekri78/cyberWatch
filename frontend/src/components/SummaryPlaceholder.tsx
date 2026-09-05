import { Icon } from './Icon';

/**
 * L'app de reference generait ici un "compte rendu" redige par IA. Notre
 * backend reel n'a pas (encore) d'endpoint de generation de texte -- Phase
 * 5 (DeepSeek) ne fait que filtrer la pertinence des evenements gdelt,
 * elle ne redige rien. Plutot que d'inventer un texte pour remplir cet
 * espace, on l'affiche honnetement comme une fonctionnalite a venir.
 */
export function SummaryPlaceholder() {
  return (
    <div className="cw-panel" style={{ borderColor: 'rgba(113,112,255,0.3)' }}>
      <div className="cw-empty" style={{ border: 'none', background: 'none', padding: '24px 12px' }}>
        <Icon name="brain" size={22} color="var(--accent)" />
        <div className="cw-empty-title">Compte rendu automatique : a venir</div>
        <p className="cw-empty-desc">
          La generation d'un compte rendu redige n'est pas encore implementee cote backend. Cette page
          n'affiche que des donnees reellement collectees.
        </p>
      </div>
    </div>
  );
}
