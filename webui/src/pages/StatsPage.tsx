import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";

interface DayStat {
  date: string;
  received: number;
  replied: number;
  ignored: number;
  avgReplyDelaySec: number;
  maxReplyDelaySec: number;
  hourBuckets: number[];
  userCharTotal: number;
  herCharTotal: number;
}

const RANGES = [7, 30, 90] as const;
type Range = typeof RANGES[number];

export function StatsPage() {
  const cfg = useStore(s => s.activeConfig);
  const showSetupFlow = useStore(s => s.showSetupFlow);
  const [days, setDays] = useState<Range>(7);
  const [stats, setStats] = useState<DayStat[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cfg) return;
    setLoading(true);
    void api.getStats(cfg.slug, days)
      .then(r => setStats(r.stats))
      .catch(() => setStats([]))
      .finally(() => setLoading(false));
  }, [cfg?.slug, days]);

  if (!cfg) {
    return (
      <div className="empty">
        <div className="em-icon">▦</div>
        <div className="em-title">未选择个人资料</div>
        <button className="btn primary" onClick={() => showSetupFlow(true)}>创建</button>
      </div>
    );
  }

  const totals = stats.reduce(
    (acc, d) => ({
      received: acc.received + d.received,
      replied: acc.replied + d.replied,
      ignored: acc.ignored + d.ignored,
      userChar: acc.userChar + d.userCharTotal,
      herChar: acc.herChar + d.herCharTotal
    }),
    { received: 0, replied: 0, ignored: 0, userChar: 0, herChar: 0 }
  );

  const replyRate = totals.received > 0 ? (totals.replied / totals.received) * 100 : 0;
  const maxBarValue = Math.max(1, ...stats.map(d => Math.max(d.received, d.replied)));
  const hourMax = Math.max(1, ...stats.flatMap(d => d.hourBuckets));

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 980 }}>
      <div className="card">
        <div className="card-header">
          <div className="h-title">对话统计</div>
          <div className="h-meta">{loading ? "加载中…" : `${stats.length} 天`}</div>
          <div className="h-actions">
            {RANGES.map(r => (
              <button
                key={r}
                className={`btn tiny ${r === days ? "primary" : ""}`}
                onClick={() => setDays(r)}
              >
                {r} 天
              </button>
            ))}
          </div>
        </div>
        <div className="stat-grid">
          <Stat label="收到消息" value={totals.received} />
          <Stat label="已回复" value={totals.replied} />
          <Stat label="已忽略" value={totals.ignored} />
          <Stat label="回复率" value={`${replyRate.toFixed(1)}%`} />
          <Stat label="你发送字符" value={totals.userChar} />
          <Stat label="她发送字符" value={totals.herChar} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="h-title">每日消息量</div>
          <div className="h-meta">▤ 收到　▣ 已回复</div>
        </div>
        {stats.length === 0 ? (
          <div className="empty-sub">暂无数据 — 聊几句后回来看看</div>
        ) : (
          <div className="stat-bars">
            {stats.map(d => (
              <div key={d.date} className="stat-bar-col" title={d.date}>
                <div className="stat-bar-pair">
                  <div className="stat-bar recv" style={{ height: `${(d.received / maxBarValue) * 100}%` }} />
                  <div className="stat-bar reply" style={{ height: `${(d.replied / maxBarValue) * 100}%` }} />
                </div>
                <div className="stat-bar-label">{d.date.slice(5)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="h-title">活跃时段（她的本地时区）</div>
          <div className="h-meta">0–23 时</div>
        </div>
        <div className="stat-hours">
          {Array.from({ length: 24 }, (_, h) => {
            const v = stats.reduce((sum, d) => sum + (d.hourBuckets[h] ?? 0), 0);
            return (
              <div key={h} className="stat-hour-col" title={`${h}:00 — ${v} 条`}>
                <div className="stat-hour-bar" style={{ height: `${(v / hourMax) * 100}%` }} />
                <div className="stat-hour-label">{h}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat-cell">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}