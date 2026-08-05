import { History } from 'lucide-react';

import type { AuditRecord } from '../../services/adminApi';

interface AdminAuditProps {
  records: AuditRecord[] | null;
}

const ACTION_LABELS: Record<string, string> = {
  'session.login': '管理员登录',
  'session.logout': '管理员退出',
  'provider.create': '新增供应商',
  'provider.update': '更新供应商',
  'provider.delete': '删除供应商',
  'provider.discover': '发现模型',
  'provider.test': '连接测试',
  'provider.activate': '激活模型',
};

export function AdminAudit({ records }: AdminAuditProps) {
  return (
    <section className="admin-panel admin-audit-panel" aria-labelledby="audit-title">
      <header className="admin-panel-heading">
        <div>
          <h2 id="audit-title">最近操作</h2>
          <p>只保存操作结果，不保存密钥与对话内容。</p>
        </div>
        <History size={20} strokeWidth={1.7} aria-hidden="true" />
      </header>
      {records === null ? (
        <div className="admin-audit-skeleton" aria-label="正在加载审计记录">
          <span />
          <span />
          <span />
        </div>
      ) : records.length === 0 ? (
        <p className="admin-table-empty">还没有管理操作记录。</p>
      ) : (
        <ol className="admin-audit-list">
          {records.slice(0, 12).map((record) => (
            <li key={record.id}>
              <div>
                <strong>{ACTION_LABELS[record.action] ?? record.action}</strong>
                <span>{new Date(record.occurred_at).toLocaleString('zh-CN')}</span>
              </div>
              <span className={record.result === 'success' ? 'is-success' : 'is-failure'}>
                {record.result === 'success' ? '成功' : '失败'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

