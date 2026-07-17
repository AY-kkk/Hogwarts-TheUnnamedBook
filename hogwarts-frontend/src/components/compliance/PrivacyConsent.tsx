import { useEffect, useState } from 'react';
import { Download, ShieldCheck, Trash2, X } from 'lucide-react';
import { LEGAL_CONFIG, PRIVACY_POLICY_VERSION } from '../../config/legal';
import {
  acceptPrivacyConsent,
  deleteAllLocalData,
  downloadLocalData,
  revokePrivacyConsent,
} from '../../services/privacy';

interface PrivacyConsentProps {
  isOpen: boolean;
  required: boolean;
  hasConsent: boolean;
  onAccept: () => void;
  onClose: () => void;
  onRevoke: () => void;
}

export function PrivacyConsent({
  isOpen,
  required,
  hasConsent,
  onAccept,
  onClose,
  onRevoke,
}: PrivacyConsentProps) {
  const [localStorageAccepted, setLocalStorageAccepted] = useState(false);
  const [modelTransferAccepted, setModelTransferAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLocalStorageAccepted(hasConsent);
    setModelTransferAccepted(hasConsent);
  }, [hasConsent, isOpen]);

  if (!isOpen) return null;

  const canAccept = localStorageAccepted && modelTransferAccepted && !saving;

  const handleAccept = async () => {
    if (!canAccept) return;
    setSaving(true);
    try {
      await acceptPrivacyConsent();
      onAccept();
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('撤回后将停止新的 AI 请求，是否继续？')) return;
    await revokePrivacyConsent();
    onRevoke();
  };

  const handleDelete = async () => {
    if (!window.confirm('这会永久删除本浏览器中的全部角色和剧情，是否继续？')) return;
    await deleteAllLocalData();
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#8c7b6c] bg-[#F4EBD0] p-6 text-[#2C1E14] shadow-2xl"
      >
        {!required && (
          <button
            type="button"
            aria-label="关闭隐私说明"
            onClick={onClose}
            className="absolute right-4 top-4 rounded p-2 hover:bg-black/5"
          >
            <X size={20} />
          </button>
        )}

        <h2 id="privacy-title" className="mb-3 flex items-center gap-2 text-2xl">
          <ShieldCheck className="text-[#8A6D3B]" />
          隐私与 AI 数据处理说明
        </h2>
        <p className="mb-4 text-sm text-black/60">版本：{PRIVACY_POLICY_VERSION}</p>

        <div className="space-y-3 text-base leading-7">
          <p>
            运营方：{LEGAL_CONFIG.operatorName}。隐私联系渠道：{LEGAL_CONFIG.privacyContact}。
          </p>
          <p>
            角色档案、游戏状态和剧情记录主要保存在当前浏览器的 IndexedDB 中。清除浏览器数据会导致本地存档丢失。
          </p>
          <p>
            当你创建角色或发送行动时，必要的角色设定、近期剧情、状态和输入会发送至：
            <strong>{LEGAL_CONFIG.modelDataDestinations}</strong>，用于生成剧情和判定结果。
          </p>
          <p>
            请不要在角色资料或对话中填写真实身份证号、联系方式、住址、账号密码、健康或金融信息。
          </p>
        </div>

        <details className="my-5 rounded border border-black/10 bg-white/30 p-4">
          <summary className="cursor-pointer font-bold">查看完整处理规则</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
            <li>处理目的：创建角色、生成剧情、执行规则判定、恢复有效时间线和排查服务错误。</li>
            <li>本地数据：角色、日志、记忆、世界线、设置和同意记录。</li>
            <li>服务端数据：单次请求所需上下文和运行日志；生产保存期限由正式隐私政策配置并公示。</li>
            <li>第三方数据：模型服务商可能按照其企业服务条款处理请求内容。</li>
            <li>你的权利：查看本说明、导出本地数据、撤回同意以及删除全部本地数据。</li>
            <li>政策版本变化后，系统会要求重新确认。</li>
          </ul>
        </details>

        {!hasConsent ? (
          <div className="space-y-3">
            <label className="flex items-start gap-3 rounded border border-black/10 p-3">
              <input
                type="checkbox"
                checked={localStorageAccepted}
                onChange={(event) => setLocalStorageAccepted(event.target.checked)}
                className="mt-1"
              />
              <span>我已了解角色和剧情主要保存在本浏览器，并可自行导出或删除。</span>
            </label>
            <label className="flex items-start gap-3 rounded border border-black/10 p-3">
              <input
                type="checkbox"
                checked={modelTransferAccepted}
                onChange={(event) => setModelTransferAccepted(event.target.checked)}
                className="mt-1"
              />
              <span>我同意将生成剧情所必需的输入和游戏上下文发送给上述模型服务商。</span>
            </label>
            <button
              type="button"
              disabled={!canAccept}
              onClick={handleAccept}
              className="w-full rounded bg-[#2C1E14] px-4 py-3 text-[#F4EBD0] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? '正在保存...' : '同意并继续'}
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={downloadLocalData}
              className="flex items-center justify-center gap-2 rounded border border-black/20 px-3 py-2"
            >
              <Download size={16} /> 导出数据
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              className="rounded border border-black/20 px-3 py-2"
            >
              撤回同意
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center justify-center gap-2 rounded border border-red-800/40 px-3 py-2 text-red-900"
            >
              <Trash2 size={16} /> 删除全部
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
