import type { Indicator, Posture } from '../posture';

function IndicatorTile({ indicator }: { indicator: Indicator }) {
  return (
    <div className={`cw-indicator ${indicator.alert ? 'cw-indicator--alert' : ''}`}>
      <div className="cw-indicator-value">{indicator.value}</div>
      <div className="cw-indicator-label">{indicator.label}</div>
    </div>
  );
}

export function PostureBanner({ posture, indicators }: { posture: Posture; indicators: Indicator[] }) {
  return (
    <div className="cw-panel">
      <div className="cw-posture-row">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <span className="cw-posture-dot" style={{ background: posture.color, boxShadow: `0 0 10px ${posture.color}` }} />
          <span className="cw-posture-label" style={{ color: posture.color }}>
            {posture.label.toUpperCase()}
          </span>
        </span>
        <span className="cw-posture-divider" />
        <p className="cw-posture-caption">{posture.caption}</p>
      </div>
      <div className="cw-indicators">
        {indicators.map((indicator) => (
          <IndicatorTile key={indicator.label} indicator={indicator} />
        ))}
      </div>
    </div>
  );
}
