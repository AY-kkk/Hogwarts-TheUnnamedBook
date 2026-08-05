import { useState } from 'react';
import {
  CheckCircle2,
  Pencil,
  PlugZap,
  RefreshCw,
  ServerCog,
  Trash2,
} from 'lucide-react';

import type { ModelProvider } from '../../services/adminApi';

interface ProviderListProps {
  providers: ModelProvider[] | null;
  busyAction: string | null;
  onAdd: () => void;
  onEdit: (provider: ModelProvider) => void;
  onDiscover: (provider: ModelProvider) => Promise<void>;
  onTest: (provider: ModelProvider, model: string) => Promise<void>;
  onActivate: (provider: ModelProvider, model: string) => Promise<void>;
  onDelete: (provider: ModelProvider) => Promise<void>;
}

export function ProviderList({
  providers,
  busyAction,
  onAdd,
  onEdit,
  onDiscover,
  onTest,
  onActivate,
  onDelete,
}: ProviderListProps) {
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});

  if (providers === null) {
    return (
      <div className="admin-provider-skeleton" aria-label="正在加载供应商">
        <span />
        <span />
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="admin-empty-state">
        <ServerCog size={34} strokeWidth={1.5} aria-hidden="true" />
        <h3>还没有模型供应商</h3>
        <p>先添加一个厂商模板或自定义 OpenAI 兼容端点。</p>
        <button className="admin-button admin-button-primary" onClick={onAdd}>
          添加第一个供应商
        </button>
      </div>
    );
  }

  return (
    <div className="admin-provider-list">
      {providers.map((provider) => {
        const model =
          selectedModels[provider.id] ?? provider.active_model ?? provider.models[0] ?? '';
        const actionPrefix = `${provider.id}:`;
        const isBusy = Boolean(busyAction?.startsWith(actionPrefix));
        return (
          <article
            className={`admin-provider-row${provider.is_active ? ' is-active' : ''}`}
            key={provider.id}
          >
            <div className="admin-provider-main">
              <div className="admin-provider-title-line">
                <div>
                  <h3>{provider.name}</h3>
                  <p>{provider.base_url}</p>
                </div>
                <div className="admin-provider-state">
                  {provider.is_active && (
                    <span className="admin-active-state">
                      <CheckCircle2 size={15} strokeWidth={2} /> 当前激活
                    </span>
                  )}
                  {!provider.is_enabled && <span className="admin-muted-state">已停用</span>}
                </div>
              </div>

              <div className="admin-provider-meta">
                <span>{provider.preset.toUpperCase()}</span>
                <span>Key 尾号 {provider.api_key_last4 || '未知'}</span>
                <span>{provider.models.length} 个模型</span>
              </div>

              <label className="admin-inline-model">
                <span>{provider.name} 模型</span>
                <select
                  value={model}
                  onChange={(event) =>
                    setSelectedModels((current) => ({
                      ...current,
                      [provider.id]: event.target.value,
                    }))
                  }
                  disabled={isBusy || provider.models.length === 0}
                >
                  {provider.models.length === 0 ? (
                    <option value="">请先发现或手动填写模型</option>
                  ) : (
                    provider.models.map((item) => (
                      <option value={item} key={item}>
                        {item}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            <div className="admin-provider-actions">
              <button
                className="admin-button admin-button-quiet"
                onClick={() => void onDiscover(provider)}
                disabled={isBusy || !provider.is_enabled}
              >
                <RefreshCw size={16} strokeWidth={1.8} /> 发现模型
              </button>
              <button
                className="admin-button admin-button-quiet"
                onClick={() => void onTest(provider, model)}
                disabled={isBusy || !provider.is_enabled || !model}
              >
                <PlugZap size={16} strokeWidth={1.8} /> 连接测试
              </button>
              <button
                className="admin-button admin-button-primary"
                aria-label={model ? `激活 ${model}` : '激活模型'}
                onClick={() => void onActivate(provider, model)}
                disabled={
                  isBusy ||
                  !provider.is_enabled ||
                  !model ||
                  (provider.is_active && provider.active_model === model)
                }
              >
                <CheckCircle2 size={16} strokeWidth={1.8} /> 激活
              </button>
              <button
                className="admin-icon-button"
                aria-label={`编辑 ${provider.name}`}
                onClick={() => onEdit(provider)}
                disabled={isBusy}
              >
                <Pencil size={17} strokeWidth={1.8} />
              </button>
              <button
                className="admin-icon-button admin-icon-danger"
                aria-label={`删除 ${provider.name}`}
                onClick={() => void onDelete(provider)}
                disabled={isBusy || provider.is_active}
              >
                <Trash2 size={17} strokeWidth={1.8} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
