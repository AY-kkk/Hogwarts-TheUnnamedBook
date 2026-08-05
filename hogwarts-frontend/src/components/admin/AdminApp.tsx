import { useCallback, useEffect, useState } from 'react';
import { Database, LogOut, Plus, ShieldCheck } from 'lucide-react';

import {
  AdminAuthenticationError,
  activateProvider,
  adminLogout,
  createProvider,
  deleteProvider,
  discoverModels,
  getAdminSession,
  getAudit,
  getUsage,
  listProviders,
  testProvider,
  updateProvider,
  type AdminSession,
  type AuditRecord,
  type ModelProvider,
  type ProviderInput,
  type ProviderUpdateInput,
  type UsageSummary,
  type UsageWindow,
} from '../../services/adminApi';
import { AdminAudit } from './AdminAudit';
import { AdminLogin } from './AdminLogin';
import { ProviderEditor } from './ProviderEditor';
import { ProviderList } from './ProviderList';
import { UsageDashboard } from './UsageDashboard';
import './admin.css';

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

export function AdminApp() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    document.title = '模型控制室 | The Unnamed Book';
    void getAdminSession()
      .then(setSession)
      .catch((error) => {
        setBootError(messageFrom(error));
        setSession({ authenticated: false, username: null });
      });
  }, []);

  if (session === null) {
    return (
      <main className="admin-boot" aria-live="polite">
        <ShieldCheck size={34} strokeWidth={1.6} />
        <span>正在验证管理会话</span>
      </main>
    );
  }

  if (!session.authenticated) {
    return (
      <>
        {bootError && <p className="admin-global-error">{bootError}</p>}
        <AdminLogin onAuthenticated={setSession} />
      </>
    );
  }

  return <AdminDashboard session={session} onSignedOut={() => setSession({ authenticated: false, username: null })} />;
}

interface AdminDashboardProps {
  session: AdminSession;
  onSignedOut: () => void;
}

function AdminDashboard({ session, onSignedOut }: AdminDashboardProps) {
  const [providers, setProviders] = useState<ModelProvider[] | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageLoadFailed, setUsageLoadFailed] = useState(false);
  const [audit, setAudit] = useState<AuditRecord[] | null>(null);
  const [usageWindow, setUsageWindow] = useState<UsageWindow>('24h');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const handleFailure = useCallback(
    (caught: unknown) => {
      if (caught instanceof AdminAuthenticationError) {
        onSignedOut();
        return;
      }
      setError(messageFrom(caught));
    },
    [onSignedOut],
  );

  const refreshAudit = useCallback(async () => {
    try {
      setAudit(await getAudit());
    } catch (caught) {
      handleFailure(caught);
    }
  }, [handleFailure]);

  useEffect(() => {
    void Promise.all([listProviders(), getAudit()])
      .then(([nextProviders, nextAudit]) => {
        setProviders(nextProviders);
        setAudit(nextAudit);
      })
      .catch(handleFailure);
  }, [handleFailure]);

  useEffect(() => {
    setUsage(null);
    setUsageLoadFailed(false);
    void getUsage(usageWindow)
      .then(setUsage)
      .catch((caught) => {
        setUsageLoadFailed(true);
        handleFailure(caught);
      });
  }, [handleFailure, usageWindow]);

  function openNewProvider() {
    setEditingProvider(null);
    setEditorOpen(true);
  }

  function upsertProvider(provider: ModelProvider) {
    setProviders((current) => {
      const list = current ?? [];
      const exists = list.some((item) => item.id === provider.id);
      return exists
        ? list.map((item) => (item.id === provider.id ? provider : item))
        : [...list, provider];
    });
  }

  async function saveProvider(payload: ProviderInput | ProviderUpdateInput) {
    const saved = editingProvider
      ? await updateProvider(editingProvider.id, payload)
      : await createProvider(payload as ProviderInput);
    upsertProvider(saved);
    setEditorOpen(false);
    setEditingProvider(null);
    setNotice(editingProvider ? '供应商配置已更新' : '供应商配置已保存');
    setError('');
    await refreshAudit();
  }

  async function withAction(
    provider: ModelProvider,
    action: string,
    operation: () => Promise<void>,
  ) {
    setBusyAction(`${provider.id}:${action}`);
    setError('');
    setNotice('');
    try {
      await operation();
      await refreshAudit();
    } catch (caught) {
      handleFailure(caught);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDiscover(provider: ModelProvider) {
    await withAction(provider, 'discover', async () => {
      const models = await discoverModels(provider.id);
      upsertProvider({ ...provider, models });
      setNotice(`已发现 ${models.length} 个模型，也可以继续手动编辑模型 ID`);
    });
  }

  async function handleTest(provider: ModelProvider, model: string) {
    await withAction(provider, 'test', async () => {
      const result = await testProvider(provider.id, model);
      setNotice(`连接成功，模型 ${result.model}，延迟 ${result.latency_ms} ms`);
    });
  }

  async function handleActivate(provider: ModelProvider, model: string) {
    await withAction(provider, 'activate', async () => {
      const activated = await activateProvider(provider.id, model);
      setProviders((current) =>
        (current ?? []).map((item) =>
          item.id === activated.id
            ? activated
            : { ...item, is_active: false, active_model: item.active_model },
        ),
      );
      setNotice(`已激活 ${activated.name} / ${activated.active_model}`);
    });
  }

  async function handleDelete(provider: ModelProvider) {
    if (!window.confirm(`确认删除“${provider.name}”吗？此操作不可撤销。`)) return;
    await withAction(provider, 'delete', async () => {
      await deleteProvider(provider.id);
      setProviders((current) => (current ?? []).filter((item) => item.id !== provider.id));
      setNotice('供应商配置已删除');
    });
  }

  async function signOut() {
    try {
      await adminLogout();
    } finally {
      onSignedOut();
    }
  }

  const activeProvider = providers?.find((provider) => provider.is_active) ?? null;

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-inner">
          <div className="admin-wordmark">
            <span className="admin-brand-mark admin-brand-mark-small" aria-hidden="true">
              <ShieldCheck size={22} strokeWidth={1.7} />
            </span>
            <div>
              <strong>模型控制室</strong>
              <span>The Unnamed Book</span>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <span className="admin-user">{session.username}</span>
            <button className="admin-button admin-button-quiet" onClick={() => void signOut()}>
              <LogOut size={16} strokeWidth={1.8} /> 退出
            </button>
          </div>
        </div>
      </header>

      <main className="admin-content">
        <section className="admin-command-header" aria-labelledby="admin-title">
          <div>
            <p className="admin-kicker">OpenAI Compatible Runtime</p>
            <h1 id="admin-title">模型与推理配置</h1>
            <p>配置、测试并切换模型。新的游戏请求会立即使用当前激活项。</p>
          </div>
          <button className="admin-button admin-button-primary" onClick={openNewProvider}>
            <Plus size={17} strokeWidth={1.9} /> 添加供应商
          </button>
        </section>

        <section className="admin-runtime-strip" aria-label="当前运行状态">
          <Database size={19} strokeWidth={1.7} aria-hidden="true" />
          <div>
            <span>当前运行模型</span>
            <strong>
              {activeProvider
                ? `${activeProvider.name} / ${activeProvider.active_model}`
                : '环境变量回退模式'}
            </strong>
          </div>
          <p>{activeProvider ? '数据库配置已接管新请求' : '激活供应商后无需重启服务'}</p>
        </section>

        <div className="admin-live-region" aria-live="polite">
          {notice && <p className="admin-notice is-success">{notice}</p>}
          {error && <p className="admin-notice is-error">{error}</p>}
        </div>

        <div className="admin-workspace">
          <section className="admin-panel admin-provider-panel" aria-labelledby="providers-title">
            <header className="admin-panel-heading">
              <div>
                <h2 id="providers-title">供应商配置</h2>
                <p>密钥只展示末四位，完整值不会返回浏览器。</p>
              </div>
              <span>{providers?.length ?? 0} 项</span>
            </header>
            <ProviderList
              providers={providers}
              busyAction={busyAction}
              onAdd={openNewProvider}
              onEdit={(provider) => {
                setEditingProvider(provider);
                setEditorOpen(true);
              }}
              onDiscover={handleDiscover}
              onTest={handleTest}
              onActivate={handleActivate}
              onDelete={handleDelete}
            />
          </section>

          <aside className="admin-sidebar">
            <UsageDashboard
              usage={usage}
              loadFailed={usageLoadFailed}
              window={usageWindow}
              onWindowChange={setUsageWindow}
            />
            <AdminAudit records={audit} />
          </aside>
        </div>
      </main>

      {editorOpen && (
        <ProviderEditor
          provider={editingProvider}
          onClose={() => {
            setEditorOpen(false);
            setEditingProvider(null);
          }}
          onSave={saveProvider}
        />
      )}
    </div>
  );
}
