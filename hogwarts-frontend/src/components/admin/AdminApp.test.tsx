import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModelProvider, UsageSummary } from '../../services/adminApi';
import { AdminApp } from './AdminApp';

const api = vi.hoisted(() => ({
  activateProvider: vi.fn(),
  adminLogin: vi.fn(),
  adminLogout: vi.fn(),
  createProvider: vi.fn(),
  deleteProvider: vi.fn(),
  discoverModels: vi.fn(),
  getAdminBootstrapStatus: vi.fn(),
  getAdminSession: vi.fn(),
  getAudit: vi.fn(),
  getUsage: vi.fn(),
  initializeAdmin: vi.fn(),
  listProviders: vi.fn(),
  testProvider: vi.fn(),
  updateProvider: vi.fn(),
}));

vi.mock('../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminApi')>(
    '../../services/adminApi',
  );
  return { ...actual, ...api };
});

const emptyUsage: UsageSummary = {
  window: '24h',
  total_requests: 0,
  successful_requests: 0,
  failed_requests: 0,
  success_rate: 0,
  average_latency_ms: 0,
  input_tokens: 0,
  output_tokens: 0,
  groups: [],
};

const provider: ModelProvider = {
  id: 'provider-1',
  name: 'DeepSeek',
  preset: 'deepseek',
  base_url: 'https://api.deepseek.com',
  api_key_last4: '1234',
  has_api_key: true,
  models: ['deepseek-v4-pro'],
  active_model: null,
  is_enabled: true,
  is_active: false,
  created_at: '2026-08-06T00:00:00Z',
  updated_at: '2026-08-06T00:00:00Z',
};

describe('administrator console', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getAdminSession.mockResolvedValue({ authenticated: true, username: 'owner' });
    api.getAdminBootstrapStatus.mockResolvedValue({ registration_open: false });
    api.listProviders.mockResolvedValue([]);
    api.getUsage.mockResolvedValue(emptyUsage);
    api.getAudit.mockResolvedValue([]);
    api.createProvider.mockResolvedValue(provider);
    api.activateProvider.mockResolvedValue({
      ...provider,
      is_active: true,
      active_model: 'deepseek-v4-pro',
    });
  });

  it('allows a signed-in administrator to save and activate a manual model', async () => {
    render(<AdminApp />);

    fireEvent.click(await screen.findByRole('button', { name: '添加供应商' }));
    fireEvent.change(screen.getByLabelText('供应商模板'), { target: { value: 'deepseek' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'local-key-1234' } });
    fireEvent.change(screen.getByLabelText('模型 ID'), {
      target: { value: 'deepseek-v4-pro' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() =>
      expect(api.createProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          preset: 'deepseek',
          base_url: 'https://api.deepseek.com',
          api_key: 'local-key-1234',
          models: ['deepseek-v4-pro'],
        }),
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: '激活 deepseek-v4-pro' }));

    expect(await screen.findByText('当前激活')).toBeInTheDocument();
    expect(api.activateProvider).toHaveBeenCalledWith('provider-1', 'deepseek-v4-pro');
  });

  it('shows login first and enters the dashboard after valid credentials', async () => {
    api.getAdminSession.mockResolvedValue({ authenticated: false, username: null });
    api.adminLogin.mockResolvedValue(undefined);

    render(<AdminApp />);

    fireEvent.change(await screen.findByLabelText('管理员用户名'), {
      target: { value: 'owner' },
    });
    fireEvent.change(screen.getByLabelText('管理员密码'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '进入管理台' }));

    expect(await screen.findByRole('button', { name: '添加供应商' })).toBeInTheDocument();
    expect(api.adminLogin).toHaveBeenCalledWith('owner', 'correct-password');
  });

  it('lets the first owner initialize the administrator account only while setup is open', async () => {
    api.getAdminSession.mockResolvedValue({ authenticated: false, username: null });
    api.getAdminBootstrapStatus.mockResolvedValue({ registration_open: true });
    api.initializeAdmin.mockResolvedValue({ authenticated: true, username: 'first-owner' });

    render(<AdminApp />);

    expect(await screen.findByRole('heading', { name: '初始化管理员' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('管理员用户名'), {
      target: { value: 'first-owner' },
    });
    fireEvent.change(screen.getByLabelText('管理员密码'), {
      target: { value: 'correct-password' },
    });
    fireEvent.change(screen.getByLabelText('确认管理员密码'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建管理员并进入管理台' }));

    expect(await screen.findByRole('button', { name: '添加供应商' })).toBeInTheDocument();
    expect(api.initializeAdmin).toHaveBeenCalledWith('first-owner', 'correct-password');
  });

  it('returns to normal login rather than setup after the first owner signs out', async () => {
    api.getAdminSession.mockResolvedValue({ authenticated: false, username: null });
    api.getAdminBootstrapStatus.mockResolvedValue({ registration_open: true });
    api.initializeAdmin.mockResolvedValue({ authenticated: true, username: 'first-owner' });

    render(<AdminApp />);

    fireEvent.change(await screen.findByLabelText('管理员用户名'), {
      target: { value: 'first-owner' },
    });
    fireEvent.change(screen.getByLabelText('管理员密码'), {
      target: { value: 'correct-password' },
    });
    fireEvent.change(screen.getByLabelText('确认管理员密码'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建管理员并进入管理台' }));
    fireEvent.click(await screen.findByRole('button', { name: '退出' }));

    expect(await screen.findByRole('heading', { name: '管理员验证' })).toBeInTheDocument();
    expect(screen.queryByLabelText('确认管理员密码')).not.toBeInTheDocument();
  });

  it('keeps manual entry available when model discovery fails', async () => {
    api.listProviders.mockResolvedValue([provider]);
    api.discoverModels.mockRejectedValue(new Error('该供应商未提供模型列表'));

    render(<AdminApp />);
    fireEvent.click(await screen.findByRole('button', { name: '发现模型' }));

    expect(await screen.findByText('该供应商未提供模型列表')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '激活 deepseek-v4-pro' })).toBeEnabled();
  });

  it('keeps keyboard focus inside the provider editor and restores its trigger', async () => {
    render(<AdminApp />);

    const trigger = await screen.findByRole('button', { name: '添加供应商' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(await screen.findByRole('button', { name: '关闭配置' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
