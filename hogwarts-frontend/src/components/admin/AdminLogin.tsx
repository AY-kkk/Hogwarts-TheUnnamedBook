import { useState, type FormEvent } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';

import { adminLogin, initializeAdmin, type AdminSession } from '../../services/adminApi';

interface AdminLoginProps {
  registrationOpen: boolean;
  onAuthenticated: (session: AdminSession) => void;
}

export function AdminLogin({ registrationOpen, onAuthenticated }: AdminLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (registrationOpen && password !== confirmation) {
      setError('两次输入的管理员密码不一致');
      return;
    }
    setIsSubmitting(true);
    try {
      let session: AdminSession;
      if (registrationOpen) {
        session = await initializeAdmin(username, password);
      } else {
        await adminLogin(username, password);
        session = { authenticated: true, username };
      }
      setPassword('');
      setConfirmation('');
      onAuthenticated(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登录失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-intro" aria-label="管理台简介">
        <div className="admin-brand-mark" aria-hidden="true">
          <ShieldCheck size={34} strokeWidth={1.7} />
        </div>
        <p className="admin-kicker">The Unnamed Book</p>
        <h1>模型控制室</h1>
        <p>
          在一个安全入口中配置兼容 OpenAI Chat Completions 协议的模型，完成连接测试并实时切换游戏推理引擎。
        </p>
        <div className="admin-login-capabilities" aria-label="后台能力">
          <span>加密保存密钥</span>
          <span>无需重启切换</span>
          <span>脱敏用量记录</span>
        </div>
      </section>

      <section className="admin-login-panel" aria-labelledby="admin-login-title">
        <div className="admin-login-heading">
          <KeyRound size={22} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <h2 id="admin-login-title">{registrationOpen ? '初始化管理员' : '管理员验证'}</h2>
            <p>
              {registrationOpen
                ? '这是首次部署的唯一注册机会，创建后入口会自动关闭。'
                : '凭据只会发送到当前产品后端。'}
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="admin-form">
          <label className="admin-field">
            <span>管理员用户名</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </label>
          {registrationOpen && (
            <label className="admin-field">
              <span>确认管理员密码</span>
              <input
                aria-label="确认管理员密码"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={isSubmitting}
                required
              />
            </label>
          )}
          <label className="admin-field">
            <span>管理员密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </label>
          <p className="admin-form-error" role="alert" aria-live="polite">
            {error}
          </p>
          <button className="admin-button admin-button-primary admin-button-wide" disabled={isSubmitting}>
            {isSubmitting
              ? registrationOpen
                ? '正在创建'
                : '正在验证'
              : registrationOpen
                ? '创建管理员并进入管理台'
                : '进入管理台'}
          </button>
        </form>
      </section>
    </main>
  );
}
