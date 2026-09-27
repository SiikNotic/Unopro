// Coins staked per hour (1 day) or per day, as bars. One series, so no legend: the panel title names it. Hover or
// focus a bar for the full numbers of that slot (staked, paid, house result, players, sign-ups); a table view
// carries the same numbers for screen readers and for reading them all at once.
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import type { StaffReport } from './api';
import { fmtNum, signed } from './format';

const H = 150;
const PAD = { top: 10, right: 6, bottom: 22, left: 44 };

const compact = (n: number, lang: string) => new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** A round-number top for the axis (1, 2, 2.5 or 5 × 10ⁿ). */
function niceMax(v: number): number {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function TrendChart({ report }: { report: StaffReport }) {
  const { t, language } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = report.series.map((p) => ({ ...p, staked: Number(p.staked), paid: Number(p.paid), players: Number(p.players), newUsers: Number(p.newUsers) }));
  const hourly = report.unit === 'hour';
  const label = (iso: string) =>
    new Intl.DateTimeFormat(language, hourly ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' }).format(new Date(iso));
  const max = niceMax(Math.max(0, ...pts.map((p) => p.staked)));
  const iw = Math.max(0, w - PAD.left - PAD.right);
  const ih = H - PAD.top - PAD.bottom;
  const slot = pts.length ? iw / pts.length : 0;
  const gap = slot > 6 ? 2 : 1;
  const bw = Math.max(1, slot - gap);
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const every = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor(iw / 64))));
  const hp = hover !== null ? pts[hover] : null;

  return (
    <div>
      <div className="flex justify-end -mt-1 mb-1">
        <button type="button" className="sd-link text-xs" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {t(asTable ? 'staff.chart.showChart' : 'staff.chart.showTable')}
        </button>
      </div>
      {asTable ? (
        <div className="sd-scroll max-h-72">
          <table className="sd-table">
            <thead>
              <tr>
                <th>{t(hourly ? 'staff.chart.hour' : 'staff.chart.day')}</th>
                <th className="sd-num">{t('staff.money.staked')}</th>
                <th className="sd-num">{t('staff.money.paid')}</th>
                <th className="sd-num">{t('staff.money.house')}</th>
                <th className="sd-num">{t('staff.chart.players')}</th>
                <th className="sd-num">{t('staff.chart.newUsers')}</th>
              </tr>
            </thead>
            <tbody>
              {pts.map((p) => (
                <tr key={p.t} className="is-static">
                  <td>{label(p.t)}</td>
                  <td className="sd-num">{fmtNum(p.staked, language)}</td>
                  <td className="sd-num">{fmtNum(p.paid, language)}</td>
                  <td className="sd-num">{signed(p.staked - p.paid, language)}</td>
                  <td className="sd-num">{fmtNum(p.players, language)}</td>
                  <td className="sd-num">{fmtNum(p.newUsers, language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="sd-chart" onMouseLeave={() => setHover(null)}>
          {w > 0 && (
            <svg width={w} height={H} role="img" aria-label={t('staff.chart.aria')}>
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={PAD.left} x2={w - PAD.right} y1={y(v)} y2={y(v)} className="sd-chart-grid" />
                  <text x={PAD.left - 6} y={y(v)} className="sd-chart-axis" textAnchor="end" dominantBaseline="middle">
                    {compact(v, language)}
                  </text>
                </g>
              ))}
              {pts.map((p, i) => {
                const x = PAD.left + i * slot + gap / 2;
                const top = y(p.staked);
                const hgt = PAD.top + ih - top;
                const r = Math.min(4, bw / 2, hgt);
                const d =
                  hgt <= 0
                    ? ''
                    : `M${x},${PAD.top + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${PAD.top + ih} Z`;
                return (
                  <g key={p.t}>
                    {d && <path d={d} className={`sd-chart-bar ${hover === i ? 'is-hover' : ''}`} />}
                    {/* the hit target is the whole slot, taller and wider than the bar */}
                    <rect
                      x={PAD.left + i * slot}
                      y={PAD.top}
                      width={slot}
                      height={ih}
                      fill="transparent"
                      tabIndex={0}
                      aria-label={`${label(p.t)}: ${fmtNum(p.staked, language)}`}
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                    />
                    {i % every === 0 && (
                      <text x={PAD.left + i * slot + slot / 2} y={H - 6} className="sd-chart-axis" textAnchor="middle">
                        {label(p.t)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
          {hp && hover !== null && (
            <div className="sd-tip" style={{ left: Math.min(Math.max(PAD.left + hover * slot + slot / 2, 90), w - 90) }} role="status">
              <b>{label(hp.t)}</b>
              <span>
                {t('staff.money.staked')} <b>{fmtNum(hp.staked, language)}</b>
              </span>
              <span>
                {t('staff.money.paid')} <b>{fmtNum(hp.paid, language)}</b>
              </span>
              <span>
                {t('staff.money.house')} <b>{signed(hp.staked - hp.paid, language)}</b>
              </span>
              <span>
                {t('staff.chart.players')} <b>{fmtNum(hp.players, language)}</b> · {t('staff.chart.newUsers')} <b>{fmtNum(hp.newUsers, language)}</b>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
