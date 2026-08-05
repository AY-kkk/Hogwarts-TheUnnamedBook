import { Activity, Gauge, Timer, WandSparkles } from 'lucide-react';

import type { UsageSummary, UsageWindow } from '../../services/adminApi';

interface UsageDashboardProps {
  usage: UsageSummary | null;
  loadFailed: boolean;
  window: UsageWindow;
  onWindowChange: (window: UsageWindow) => void;
}

const WINDOWS: Array<{ value: UsageWindow; label: string }> = [
  { value: '24h', label: '24 小时' },
  { value: '7d', label: '7 天' },
  { value: '30d', label: '30 天' },
];

function percent(value: number): string {
  return `${(value * 100).toFixed(value === 0 ? 0 : 1)}%`;
}

export function UsageDashboard({ usage, loadFailed, window, onWindowChange }: UsageDashboardProps) {
  return (
    <section className="admin-panel" aria-labelledby="usage-title">
      <header className="admin-panel-heading admin-usage-heading">
        <div>
          <h2 id="usage-title">基础用量</h2>
          <p>仅记录请求元数据，Token 为字符估算值。</p>
        </div>
        <div className="admin-segmented" aria-label="用量时间范围">
          {WINDOWS.map((item) => (
            <button
              key={item.value}
              aria-pressed={window === item.value}
              onClick={() => onWindowChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {loadFailed ? (
        <p className="admin-table-empty" role="alert">
          用量加载失败，请切换时间范围重试。
        </p>
      ) : !usage ? (
        <div className="admin-usage-skeleton" aria-label="正在加载用量">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <>
          <div className="admin-metrics-grid">
            <article>
              <Activity size={18} strokeWidth={1.7} />
              <span>请求总数</span>
              <strong>{usage.total_requests}</strong>
            </article>
            <article>
              <WandSparkles size={18} strokeWidth={1.7} />
              <span>成功率</span>
              <strong>{percent(usage.success_rate)}</strong>
            </article>
            <article>
              <Timer size={18} strokeWidth={1.7} />
              <span>平均延迟</span>
              <strong>{usage.average_latency_ms.toFixed(0)} ms</strong>
            </article>
            <article>
              <Gauge size={18} strokeWidth={1.7} />
              <span>估算 Token</span>
              <strong>{(usage.input_tokens + usage.output_tokens).toLocaleString()}</strong>
            </article>
          </div>

          {usage.groups.length === 0 ? (
            <p className="admin-table-empty">激活模型并运行游戏后，这里会显示脱敏用量。</p>
          ) : (
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>供应商 / 模型</th>
                    <th>请求</th>
                    <th>成功率</th>
                    <th>延迟</th>
                    <th>输入 / 输出</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.groups.map((group) => (
                    <tr key={`${group.provider_name}:${group.model}`}>
                      <td>
                        <strong>{group.provider_name}</strong>
                        <span>{group.model}</span>
                      </td>
                      <td>{group.total_requests}</td>
                      <td>{percent(group.success_rate)}</td>
                      <td>{group.average_latency_ms.toFixed(0)} ms</td>
                      <td>
                        {group.input_tokens.toLocaleString()} / {group.output_tokens.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
