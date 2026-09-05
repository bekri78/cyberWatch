import { Icon } from './Icon';

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="cw-loading">
      <span className="cw-spinner" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="cw-empty">
      <Icon name="alert" size={22} color="var(--warning)" />
      <div className="cw-empty-title">Chargement impossible</div>
      <p className="cw-empty-desc">{message}</p>
      <button type="button" className="cw-button cw-button--primary" onClick={onRetry}>
        <Icon name="refresh" size={14} />
        Reessayer
      </button>
    </div>
  );
}
