import { useEffect, useState } from 'react';
import { Flag, X } from 'lucide-react';
import type { Log } from '../../lib/db';
import { REPORT_CATEGORIES, submitContentReport } from '../../services/reports';

interface ContentReportDialogProps {
  characterUuid: string;
  log: Log | null;
  onClose: () => void;
}

export function ContentReportDialog({ characterUuid, log, onClose }: ContentReportDialogProps) {
  const [category, setCategory] = useState(REPORT_CATEGORIES[0].value as string);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setCategory(REPORT_CATEGORIES[0].value);
    setNote('');
    setResult('');
    setError('');
  }, [log]);

  if (!log) return null;

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const reportId = await submitContentReport(characterUuid, log, category, note);
      setResult(reportId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '举报提交失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="report-title" className="relative w-full max-w-lg rounded-lg bg-[#F4EBD0] p-6 text-[#2C1E14] shadow-2xl">
        <button type="button" aria-label="关闭举报对话框" onClick={onClose} className="absolute right-4 top-4 p-2">
          <X size={18} />
        </button>
        <h2 id="report-title" className="mb-3 flex items-center gap-2 text-2xl"><Flag size={20} /> 举报 AI 内容</h2>
        <p className="mb-4 text-sm text-black/60">只提交角色、日志和请求引用，不会自动上传整段故事正文。</p>
        {result ? (
          <div className="rounded border border-green-800/30 bg-green-50 p-4">
            已受理，编号：<strong>{result}</strong>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-bold">问题类型</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded border border-black/20 bg-white/40 p-2">
                {REPORT_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold">补充说明（可选，请勿填个人敏感信息）</span>
              <textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className="min-h-24 w-full rounded border border-black/20 bg-white/40 p-2" />
            </label>
            {error && <p className="text-sm text-red-800">{error}</p>}
            <button type="button" disabled={saving} onClick={handleSubmit} className="w-full rounded bg-[#2C1E14] px-4 py-3 text-[#F4EBD0] disabled:opacity-40">
              {saving ? '正在提交...' : '提交举报'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
