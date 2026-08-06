import { SlidersHorizontal } from 'lucide-react';

export function AdminEntryLink() {
  return (
    <a
      href="/admin"
      aria-label="后台管理与模型配置"
      className="fixed right-4 top-4 z-[90] inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/60 px-3 py-2 text-xs text-white/80 shadow-lg backdrop-blur transition hover:border-amber-200/50 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
    >
      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      <span>后台管理</span>
    </a>
  );
}
