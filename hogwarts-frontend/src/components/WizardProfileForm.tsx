import React, { useState } from 'react';
import { db, addLog } from '../lib/db';
import { cn } from '../lib/utils';
import { Sparkles, Scroll, Feather } from 'lucide-react';
import { apiUrl } from '../config/api';

interface WizardProfileFormProps {
  onComplete: () => void;
}

const ERAS = [
  "创始人时代",
  "格林德沃时代",
  "掠夺者时代",
  "救世主时代"
];

const BLOOD_STATUS = [
  "纯血",
  "混血",
  "麻瓜出身"
];

export function WizardProfileForm({ onComplete }: WizardProfileFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    gender: '男',
    blood_status: '混血',
    era: '救世主时代',
    initial_trait: '',
    wand: '',
    patronus: '',
    self_description: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) newErrors.name = "姓名不能为空";
    if (!formData.initial_trait.trim()) newErrors.initial_trait = "初始特质不能为空";
    if (!formData.wand.trim()) newErrors.wand = "魔杖信息不能为空";
    if (!formData.patronus.trim()) newErrors.patronus = "守护神不能为空";
    
    const selfDescLen = formData.self_description.length;
    if (selfDescLen < 20 || selfDescLen > 200) {
      newErrors.self_description = `字数需在 20-200 之间 (当前: ${selfDescLen})`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setLoadingText("正在登记学籍...");

    try {
      // 1. Register Profile
      const profileRes = await fetch(apiUrl('/api/wizard-profile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (!profileRes.ok) throw new Error("Failed to create profile");
      const { profileId } = await profileRes.json();

      // 2. Start Story
      setLoadingText("正在编织命运...");
      const storyRes = await fetch(apiUrl('/api/story/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profileId,
          self_description: formData.self_description
        })
      });

      if (!storyRes.ok) throw new Error("Failed to start story");
      const { narrative } = await storyRes.json();

      if (!narrative) {
        throw new Error("‘自我’描述未触发分支，请检查档案完整性");
      }

      // 3. Save to Local DB
      await db.transaction('rw', db.character, db.logs, async () => {
        // Clear existing (just in case)
        await db.character.clear();
        await db.logs.clear();

        await db.character.add({
          uuid: profileId,
          name: formData.name,
          gender: formData.gender,
          blood_status: formData.blood_status,
          era: formData.era,
          initial_trait: formData.initial_trait,
          patronus: formData.patronus,
          self_description: formData.self_description,
          wand_description: formData.wand,
          
          // Default stats
          house: "Unsorted", // Will be sorted in-game
          status: {
            hp: 100, mp: 50, gold: 10, level: 1, exp: 0,
            attributes: { knowledge: 10, courage: 10, stamina: 10, charm: 10, mental: 10 },
            inventory: ["School Robes"], 
            location: "Prologue",
            current_year: 1
          },
          summary: "A student's journey begins...",
          // Map wand text to object structure roughly or keep default
          wand: {
            wood: "Unknown",
            core: "Unknown",
            length: 11,
            flexibility: "Unknown"
          }
        });

        await addLog(Date.now(), narrative, 'ai', profileId);
      });

      onComplete();

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "发生未知错误";
      console.error(err);
      setErrors(prev => ({ ...prev, submit: errorMessage }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1614] flex items-center justify-center p-4 font-serif text-[#d4c5a9]">
      <div className="max-w-2xl w-full bg-[#2c2420] border border-[#5c4d3c] rounded-lg shadow-2xl p-8 relative overflow-hidden">
        {/* Background Texture */}
        <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none" 
             style={{ backgroundImage: 'url("/assets/paper-texture.png")' }}></div>

        <div className="relative z-10">
          <header className="text-center mb-8 border-b border-[#5c4d3c] pb-4">
            <h1 className="text-3xl font-bold flex items-center justify-center gap-2 mb-2">
              <Sparkles className="w-6 h-6 text-[#f0c05a]" />
              霍格沃茨学籍登记表
              <Sparkles className="w-6 h-6 text-[#f0c05a]" />
            </h1>
            <p className="text-[#8c7b6c] italic">"笔尖触碰羊皮纸的瞬间，命运便已注定。"</p>
          </header>

          <div className="bg-[#3e3228] p-4 rounded mb-6 border-l-4 border-[#f0c05a]">
            <p className="text-[#f0c05a] text-sm font-bold flex items-center gap-2">
              <Feather className="w-4 h-4" />
              重要提示
            </p>
            <p className="text-sm mt-1">
              请完整填写“自我”描述，该内容将直接影响后续故事分支与角色互动。
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Name */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#a89988]">1. 姓名</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-[#1a1614] border border-[#5c4d3c] rounded p-2 text-[#d4c5a9] focus:border-[#f0c05a] outline-none transition-colors"
                  placeholder="你的名字"
                />
                {errors.name && <p className="text-red-500 text-xs">{errors.name}</p>}
              </div>

              {/* Gender */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#a89988]">2. 性别</label>
                <select 
                  value={formData.gender}
                  onChange={e => setFormData({...formData, gender: e.target.value})}
                  className="w-full bg-[#1a1614] border border-[#5c4d3c] rounded p-2 text-[#d4c5a9] focus:border-[#f0c05a] outline-none"
                >
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>

              {/* Blood Status */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#a89988]">3. 血统</label>
                <select 
                  value={formData.blood_status}
                  onChange={e => setFormData({...formData, blood_status: e.target.value})}
                  className="w-full bg-[#1a1614] border border-[#5c4d3c] rounded p-2 text-[#d4c5a9] focus:border-[#f0c05a] outline-none"
                >
                  {BLOOD_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <p className="text-xs text-[#6c5e52]">* 这将深刻影响你的社交圈</p>
              </div>

              {/* Era */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#a89988]">4. 入学时代</label>
                <select 
                  value={formData.era}
                  onChange={e => setFormData({...formData, era: e.target.value})}
                  className="w-full bg-[#1a1614] border border-[#5c4d3c] rounded p-2 text-[#d4c5a9] focus:border-[#f0c05a] outline-none"
                >
                  {ERAS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>

              {/* Initial Trait */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#a89988]">5. 初始特质</label>
                <input 
                  type="text" 
                  value={formData.initial_trait}
                  onChange={e => setFormData({...formData, initial_trait: e.target.value})}
                  className="w-full bg-[#1a1614] border border-[#5c4d3c] rounded p-2 text-[#d4c5a9] focus:border-[#f0c05a] outline-none"
                  placeholder="如：过目不忘、天生怪力"
                />
                {errors.initial_trait && <p className="text-red-500 text-xs">{errors.initial_trait}</p>}
              </div>

              {/* Wand */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#a89988]">6. 魔杖</label>
                <input 
                  type="text" 
                  value={formData.wand}
                  onChange={e => setFormData({...formData, wand: e.target.value})}
                  className="w-full bg-[#1a1614] border border-[#5c4d3c] rounded p-2 text-[#d4c5a9] focus:border-[#f0c05a] outline-none"
                  placeholder="偏好的木材/杖芯，或填“随机”"
                />
                {errors.wand && <p className="text-red-500 text-xs">{errors.wand}</p>}
              </div>

              {/* Patronus */}
              <div className="space-y-2 md:col-span-2">
                <label className="block text-sm font-medium text-[#a89988]">7. 守护神</label>
                <input 
                  type="text" 
                  value={formData.patronus}
                  onChange={e => setFormData({...formData, patronus: e.target.value})}
                  className="w-full bg-[#1a1614] border border-[#5c4d3c] rounded p-2 text-[#d4c5a9] focus:border-[#f0c05a] outline-none"
                  placeholder="内心最深处的快乐象征，或填“未知”"
                />
                {errors.patronus && <p className="text-red-500 text-xs">{errors.patronus}</p>}
              </div>
            </div>

            {/* Self Description - Key Field */}
            <div className="space-y-2 pt-4 border-t border-[#5c4d3c]">
              <label className="block text-sm font-medium text-[#f0c05a]">
                8. 自我 (Self) - 核心档案
              </label>
              <textarea 
                value={formData.self_description}
                onChange={e => setFormData({...formData, self_description: e.target.value})}
                className={cn(
                  "w-full bg-[#1a1614] border rounded p-4 text-[#d4c5a9] focus:border-[#f0c05a] outline-none min-h-[120px]",
                  errors.self_description ? "border-red-500" : "border-[#5c4d3c]"
                )}
                placeholder="请描述你的性格、背景或特殊经历（20-200字）..."
              />
              <div className="flex justify-between items-center text-xs">
                <span className={cn(
                  formData.self_description.length < 20 || formData.self_description.length > 200 
                    ? "text-red-500" 
                    : "text-[#6c5e52]"
                )}>
                  当前字数: {formData.self_description.length} / 200
                </span>
                {errors.self_description && (
                  <span className="text-red-500">{errors.self_description}</span>
                )}
              </div>
            </div>

            {/* Submit Error */}
            {errors.submit && (
              <div className="p-3 bg-red-900/30 border border-red-800 rounded text-red-200 text-sm text-center">
                {errors.submit}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-6 flex justify-center">
              <button 
                type="submit" 
                disabled={loading}
                className="bg-[#5c4d3c] hover:bg-[#6c5e4d] text-[#f0c05a] px-8 py-3 rounded border border-[#3e3228] shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold tracking-wide"
              >
                {loading ? (
                  <>
                    <Scroll className="w-5 h-5 animate-spin" />
                    {loadingText}
                  </>
                ) : (
                  <>
                    <Feather className="w-5 h-5" />
                    生成档案 (Enrol)
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
