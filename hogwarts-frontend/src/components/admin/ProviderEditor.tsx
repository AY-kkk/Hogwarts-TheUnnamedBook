import { useEffect, useRef, useState, type FormEvent } from 'react';
import { KeyRound, X } from 'lucide-react';

import type {
  ModelProvider,
  ProviderInput,
  ProviderPreset,
  ProviderUpdateInput,
} from '../../services/adminApi';

const PRESETS: Record<
  ProviderPreset,
  { label: string; name: string; baseUrl: string; helper: string }
> = {
  openai: {
    label: 'OpenAI',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    helper: 'OpenAI 官方 Chat Completions 接口',
  },
  deepseek: {
    label: 'DeepSeek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    helper: 'DeepSeek 官方 OpenAI 兼容入口',
  },
  minimax: {
    label: 'MiniMax（中国区）',
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    helper: '国际区可改为 https://api.minimax.io/v1',
  },
  glm: {
    label: '智谱 GLM',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    helper: '智谱开放平台 OpenAI 兼容入口',
  },
  custom: {
    label: '自定义兼容端点',
    name: '自定义供应商',
    baseUrl: '',
    helper: '保留厂商要求的路径，例如 /v1',
  },
};

interface ProviderEditorProps {
  provider: ModelProvider | null;
  onClose: () => void;
  onSave: (payload: ProviderInput | ProviderUpdateInput) => Promise<void>;
}

function splitModels(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  );
}

export function ProviderEditor({ provider, onClose, onSave }: ProviderEditorProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [preset, setPreset] = useState<ProviderPreset>(provider?.preset ?? 'custom');
  const [name, setName] = useState(provider?.name ?? PRESETS.custom.name);
  const [baseUrl, setBaseUrl] = useState(provider?.base_url ?? '');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState(provider?.models.join('\n') ?? '');
  const [isEnabled, setIsEnabled] = useState(provider?.is_enabled ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const returnFocus = document.activeElement;
    closeButtonRef.current?.focus();
    return () => {
      if (returnFocus instanceof HTMLElement) returnFocus.focus();
    };
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving) onClose();
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isSaving, onClose]);

  function choosePreset(value: ProviderPreset) {
    setPreset(value);
    const template = PRESETS[value];
    setName(template.name);
    setBaseUrl(template.baseUrl);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!provider && !apiKey.trim()) {
      setError('新配置必须填写 API Key');
      return;
    }
    setIsSaving(true);
    try {
      const common = {
        name: name.trim(),
        preset,
        base_url: baseUrl.trim(),
        api_key: apiKey.trim(),
        models: splitModels(models),
        is_enabled: isEnabled,
      };
      await onSave(common);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="admin-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="provider-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="admin-editor-header">
          <div>
            <p className="admin-kicker">模型供应商</p>
            <h2 id="provider-editor-title">{provider ? '编辑配置' : '添加配置'}</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="admin-icon-button"
            onClick={onClose}
            aria-label="关闭配置"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </header>

        <form className="admin-form admin-editor-form" onSubmit={submit}>
          <label className="admin-field">
            <span>供应商模板</span>
            <select
              aria-label="供应商模板"
              value={preset}
              onChange={(event) => choosePreset(event.target.value as ProviderPreset)}
              disabled={isSaving}
            >
              {Object.entries(PRESETS).map(([value, template]) => (
                <option value={value} key={value}>
                  {template.label}
                </option>
              ))}
            </select>
            <small>{PRESETS[preset].helper}</small>
          </label>

          <label className="admin-field">
            <span>配置名称</span>
            <input
              aria-label="配置名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>

          <label className="admin-field">
            <span>Base URL</span>
            <input
              aria-label="Base URL"
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              spellCheck={false}
              required
            />
            <small>服务端不会自动添加或删除版本路径。</small>
          </label>

          <label className="admin-field">
            <span className="admin-field-label-with-icon">
              <KeyRound size={15} strokeWidth={1.8} aria-hidden="true" /> API Key
            </span>
            <input
              aria-label="API Key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="new-password"
              required={!provider}
            />
            <small>{provider ? '留空会保留当前密钥。' : '密钥会在服务端加密保存。'}</small>
          </label>

          <label className="admin-field">
            <span>模型 ID</span>
            <textarea
              aria-label="模型 ID"
              value={models}
              onChange={(event) => setModels(event.target.value)}
              rows={4}
              spellCheck={false}
            />
            <small>每行一个，也可用英文逗号分隔。模型发现失败时可直接手动填写。</small>
          </label>

          <label className="admin-check-field">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(event) => setIsEnabled(event.target.checked)}
            />
            <span>允许连接、测试和激活此配置</span>
          </label>

          <p className="admin-form-error" role="alert" aria-live="polite">
            {error}
          </p>
          <div className="admin-editor-actions">
            <button type="button" className="admin-button admin-button-quiet" onClick={onClose}>
              取消
            </button>
            <button className="admin-button admin-button-primary" disabled={isSaving}>
              {isSaving ? '正在保存' : '保存配置'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
