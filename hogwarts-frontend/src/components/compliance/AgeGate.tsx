import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { MINIMUM_AGE } from '../../config/safety';
import { acceptAgeAcknowledgement } from '../../services/safety';

interface AgeGateProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function AgeGate({ isOpen, onAccept, onDecline }: AgeGateProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!isOpen) return null;

  const handleAccept = async () => {
    if (!confirmed || saving) return;
    setSaving(true);
    try {
      await acceptAgeAcknowledgement();
      onAccept();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-gate-title"
        className="w-full max-w-lg rounded-lg border border-[#8c7b6c] bg-[#F4EBD0] p-6 text-[#2C1E14] shadow-2xl"
      >
        <h2 id="age-gate-title" className="mb-4 flex items-center gap-2 text-2xl">
          <ShieldAlert className="text-[#8A6D3B]" /> 年龄与安全提示
        </h2>
        <div className="space-y-3 leading-7">
          <p>本作品含 AI 生成的奇幻冲突、悬疑和角色危险情节，不适合无监护的年幼用户。</p>
          <p>如你未达当地可独立使用数字服务的年龄，请由监护人阅读隐私与 AI 说明并同意后再继续。</p>
        </div>
        <label className="my-5 flex items-start gap-3 rounded border border-black/10 p-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-1"
          />
          <span>我已满 {MINIMUM_AGE} 岁，或已在监护人知情并同意下使用。</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onDecline} className="rounded border border-black/20 px-4 py-3">
            暂不进入
          </button>
          <button
            type="button"
            disabled={!confirmed || saving}
            onClick={handleAccept}
            className="rounded bg-[#2C1E14] px-4 py-3 text-[#F4EBD0] disabled:opacity-40"
          >
            {saving ? '正在保存...' : '确认并继续'}
          </button>
        </div>
      </section>
    </div>
  );
}
