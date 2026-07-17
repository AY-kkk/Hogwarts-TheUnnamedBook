import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ParchmentLayout } from './components/layout/ParchmentLayout';
import { MemoryBar } from './components/layout/MemoryBar';
import { NarrativeEngine } from './components/layout/NarrativeEngine';
import { QuillInput } from './components/layout/QuillInput';
import { WizardProfileForm } from './components/WizardProfileForm';
import LandingPage from './components/layout/LandingPage';
import { CharacterSelection } from './components/auth/CharacterSelection';
import { db, addLog, type Character } from './lib/db';
import { generateChapterTitle, sendChatRequest } from './services/api';
import { parseAndApplyState } from './services/tagParser';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from './lib/utils';
import { getActiveTimelineLogs } from './services/pensieveResume';
import { PrivacyConsent } from './components/compliance/PrivacyConsent';
import { hasPrivacyConsent } from './services/privacy';
import { touchCharacter } from './services/characters';

type AppState = 'landing' | 'selection' | 'create' | 'game';

function App() {
  const [appState, setAppState] = useState<AppState>('landing');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMemoryExpanded, setIsMemoryExpanded] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [privacyRequired, setPrivacyRequired] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const chatAbortRef = useRef<AbortController | null>(null);
  
  // Selected character ID
  const [activeCharacterId, setActiveCharacterId] = useState<number | null>(null);

  // Get active character
  const activeCharacter = useLiveQuery(
    () => activeCharacterId ? db.character.get(activeCharacterId) : undefined,
    [activeCharacterId]
  );

  // Live query for logs - filter by active character
  const logs = useLiveQuery(
    () => (activeCharacter?.uuid ? getActiveTimelineLogs(activeCharacter.uuid) : []),
    [activeCharacter?.uuid]
  );

  useEffect(() => {
    let active = true;
    hasPrivacyConsent().then((accepted) => {
      if (active) setPrivacyAccepted(accepted);
    });
    return () => {
      active = false;
    };
  }, []);

  // Initial Load Handler
  const handleLoadComplete = async () => {
    const accepted = await hasPrivacyConsent();
    setPrivacyAccepted(accepted);
    if (!accepted) {
      setPrivacyRequired(true);
      setPrivacyOpen(true);
      return;
    }
    setAppState('selection');
  };

  const handlePrivacyAccepted = () => {
    setPrivacyAccepted(true);
    setPrivacyRequired(false);
    setPrivacyOpen(false);
    setAppState('selection');
  };

  const handlePrivacyRevoked = () => {
    if (chatAbortRef.current) chatAbortRef.current.abort();
    setPrivacyAccepted(false);
    setPrivacyRequired(false);
    setPrivacyOpen(false);
    setLoading(false);
    setActiveCharacterId(null);
    setAppState('landing');
  };

  const withPrivacyControls = (content: ReactNode) => (
    <>
      {content}
      <button
        type="button"
        onClick={() => {
          setPrivacyRequired(false);
          setPrivacyOpen(true);
        }}
        className="fixed bottom-4 left-4 z-[90] rounded-full border border-white/20 bg-black/60 px-3 py-2 text-xs text-white/80 shadow-lg backdrop-blur hover:text-white"
      >
        隐私与数据
      </button>
      <PrivacyConsent
        isOpen={privacyOpen}
        required={privacyRequired}
        hasConsent={privacyAccepted}
        onAccept={handlePrivacyAccepted}
        onClose={() => setPrivacyOpen(false)}
        onRevoke={handlePrivacyRevoked}
      />
    </>
  );

  const handleCharacterSelect = async (char: Character) => {
    if (char.id) {
      try {
        await touchCharacter(char.id);
      } catch (error) {
        console.error('Could not update last played time', error);
      }
      setActiveCharacterId(char.id);
      setAppState('game');
    }
  };

  const handleCreateNew = () => {
    setAppState('create');
  };

  const handleCreationComplete = () => {
    // After creation, go back to selection or directly to game
    // Let's go to selection to see the new card
    setAppState('selection');
  };

  const handleSend = async () => {
    if (!input.trim() || !activeCharacter?.uuid) return;
    setLoading(true);
    const userInput = input;
    setInput('');
    const charUuid = activeCharacter.uuid;
    
    const turnId = Date.now();

    const existingLogs = await getActiveTimelineLogs(charUuid);
    const chapterIndex = existingLogs.filter(l => l.type === 'user').length + 1;
    const titleAbort = new AbortController();
    const titleTimeout = setTimeout(() => titleAbort.abort(), 6000);
    let titleName = '';
    try {
      const summary = activeCharacter.summary || '';
      titleName = await generateChapterTitle(userInput, summary, titleAbort.signal);
    } catch {
      const onlyCjk = (userInput.match(/[\u4e00-\u9fff]/g) || []).join('');
      titleName = onlyCjk.slice(0, 20) || '新的故事回合开启';
      if (titleName.length < 8) titleName = (titleName + '新的故事回合开启').slice(0, 8);
      if (titleName.length > 20) titleName = titleName.slice(0, 20);
    } finally {
      clearTimeout(titleTimeout);
    }

    await addLog(turnId, `第${chapterIndex}章:${titleName}`, 'system', charUuid);
    await addLog(turnId, userInput, 'user', charUuid);

    const aiLogId = await addLog(turnId, "", 'ai', charUuid); 
    let accumulatedText = "";

    if (chatAbortRef.current) chatAbortRef.current.abort();
    chatAbortRef.current = new AbortController();

    await sendChatRequest(
      userInput,
      charUuid,
      async (chunk) => {
        accumulatedText += chunk;
        if (aiLogId) await db.logs.update(aiLogId, { content: accumulatedText });
      },
      async () => {
        const finalText = await parseAndApplyState(accumulatedText, charUuid);
        if (aiLogId) await db.logs.update(aiLogId, { content: finalText });
        if (activeCharacter.id) await touchCharacter(activeCharacter.id);
        setLoading(false);
        chatAbortRef.current = null;
      },
      (err) => {
        const error = err instanceof Error ? err : new Error('未知错误');
        if (error.name === 'AbortError') {
          setLoading(false);
          return;
        }
        console.error("Chat Error", error);
        addLog(Date.now(), `*Error: The owl lost its way. (${error.message})*`, 'system', charUuid);
        setLoading(false);
        chatAbortRef.current = null;
      }
      ,
      { signal: chatAbortRef.current.signal }
    );
  };

  const handleBackToMain = () => {
    if (chatAbortRef.current) chatAbortRef.current.abort();
    chatAbortRef.current = null;
    setLoading(false);
    setIsMemoryExpanded(false);
    setActiveCharacterId(null);
    setAppState('selection');
  };

  // Render based on state
  if (appState === 'landing') {
    return withPrivacyControls(<LandingPage onEnter={handleLoadComplete} />);
  }

  if (appState === 'selection') {
    return withPrivacyControls(
      <CharacterSelection 
        onSelectCharacter={handleCharacterSelect}
        onCreateNew={handleCreateNew}
      />
    );
  }

  if (appState === 'create') {
    return withPrivacyControls(<WizardProfileForm onComplete={handleCreationComplete} />);
  }

  // Game State
  return withPrivacyControls(
    <div className="flex bg-[#E8DFC5]">
      {/* 1. Left Memory Bar */}
      {activeCharacter && (
        <MemoryBar 
          isExpanded={isMemoryExpanded} 
          onToggle={() => setIsMemoryExpanded(!isMemoryExpanded)} 
          character={activeCharacter}
        />
      )}

      {/* 2. Main Parchment Layout */}
      <ParchmentLayout
        isMemoryBarExpanded={isMemoryExpanded}
        house={activeCharacter?.house}
        onBackToMain={handleBackToMain}
      >
        <div className="min-h-screen pb-40">
           {/* Header / Title could go here if needed, but narrative drives the show */}
           
           {/* 3. Narrative Engine (Chat) */}
           <NarrativeEngine logs={logs || []} loading={loading} />
        </div>
      </ParchmentLayout>

      {/* 4. Fixed Input Area */}
      <div className={cn(
        "fixed bottom-0 right-0 z-40 transition-all duration-300",
        isMemoryExpanded ? "left-[360px]" : "left-[80px]"
      )}>
         <div className="max-w-[800px] mx-auto relative">
           <QuillInput 
             input={input} 
             setInput={setInput} 
             onSend={handleSend} 
             loading={loading} 
           />
         </div>
      </div>
    </div>
  );
}

export default App;
