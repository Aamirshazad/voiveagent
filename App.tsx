
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { LearningModule, TranscriptionEntry } from './types';
import { SYSTEM_INSTRUCTIONS, DEFAULT_MODULE, INITIAL_MESSAGE } from './constants';
import ModuleCard from './components/ModuleCard';
import AudioVisualizer from './components/AudioVisualizer';
import { createBlob, decode, decodeAudioData } from './services/audioService';

const MODULE_ICONS: Record<LearningModule, string> = {
  [LearningModule.PRONUNCIATION]: '🗣️',
  [LearningModule.CONVERSATION]: '💬',
  [LearningModule.GRAMMAR_VOCAB]: '📚',
  [LearningModule.BUSINESS_ENGLISH]: '💼',
  [LearningModule.TEST_PREP]: '🎯',
  [LearningModule.ACCENT_REDUCTION]: '🌍'
};

const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<LearningModule>(DEFAULT_MODULE);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const currentTranscriptionsRef = useRef({ user: '', model: '' });

  const initAudio = async () => {
    if (!audioContextsRef.current) {
      const input = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const output = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextsRef.current = { input, output };
    }
    return audioContextsRef.current;
  };

  const startSession = async () => {
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.API_KEY as string,
        httpOptions: { "apiVersion": "v1alpha" } // Required for Affective Dialog
      });

      const { input: inputCtx, output: outputCtx } = await initAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setError(null);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: createBlob(inputData) });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              setIsSpeaking(true);
              const { output } = audioContextsRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, output.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), output, 24000, 1);
              const source = output.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(output.destination);
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsSpeaking(false);
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.inputTranscription) currentTranscriptionsRef.current.user += message.serverContent.inputTranscription.text;
            if (message.serverContent?.outputTranscription) currentTranscriptionsRef.current.model += message.serverContent.outputTranscription.text;

            if (message.serverContent?.turnComplete) {
              const { user, model } = currentTranscriptionsRef.current;
              if (user || model) {
                const newEntries: TranscriptionEntry[] = [
                  { id: `u-${Date.now()}`, role: 'user', text: user, timestamp: Date.now() },
                  { id: `m-${Date.now()}`, role: 'model', text: model, timestamp: Date.now() }
                ];
                setTranscriptions(prev => [...prev, ...newEntries].slice(-30));
                currentTranscriptionsRef.current = { user: '', model: '' };
              }
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onerror: (e) => {
            console.error(e);
            setError("Connection disrupted. Re-initializing.");
            stopSession();
          },
          onclose: () => setIsConnected(false)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          enableAffectiveDialog: true,
          systemInstruction: SYSTEM_INSTRUCTIONS[activeModule],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) {
      setError(err.message || "Initialization failure.");
    }
  };

  const stopSession = async (clearHistory: boolean = false) => {
    if (sessionPromiseRef.current) {
      const session = await sessionPromiseRef.current;
      session.close();
      sessionPromiseRef.current = null;
    }
    setIsConnected(false);
    setIsSpeaking(false);
    if (clearHistory) {
      setTranscriptions([]);
      currentTranscriptionsRef.current = { user: '', model: '' };
    }
  };

  // Handle module switch - starts fresh session with new module
  const handleModuleSwitch = async (newModule: LearningModule) => {
    if (newModule === activeModule) return;

    // Stop current session and clear conversation
    await stopSession(true);

    // Set new module
    setActiveModule(newModule);
    setError(null);
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcriptions]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-blue-50 text-slate-800 overflow-hidden font-inter selection:bg-emerald-500/30">

      {/* Sidebar: Learning Modules */}
      <aside className="w-80 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col z-20 shadow-xl relative">
        <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-emerald-500 to-teal-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center font-outfit font-black text-white shadow-lg border border-white/30">
              <span className="text-2xl">🌟</span>
            </div>
            <div>
              <h1 className="font-outfit font-bold text-xl tracking-tight text-white leading-none">English Mastery</h1>
              <p className="text-xs text-emerald-50 font-medium mt-0.5">AI Language Learning Portal</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-6 bg-slate-50">
          <div>
            <div className="flex items-center justify-between px-2 mb-4">
              <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Learning Modules</h2>
              <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">6 Available</span>
            </div>
            <div className="space-y-3">
              {(Object.values(LearningModule) as LearningModule[]).map((m) => (
                <ModuleCard
                  key={m}
                  module={m}
                  isActive={activeModule === m}
                  icon={MODULE_ICONS[m]}
                  onClick={() => handleModuleSwitch(m)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Audio Status Panel */}
        <div className="p-5 bg-white border-t border-slate-200">
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200 mb-4 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50' : 'bg-slate-300'}`}></div>
                <span className="text-xs font-semibold text-slate-700">Voice Stream</span>
              </div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className={`w-1 h-3 rounded-full transition-all duration-300 ${isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} style={{ opacity: isConnected ? 1 : 0.3 }}></div>)}
              </div>
            </div>

            <div className="h-14 flex items-center justify-center bg-white rounded-lg border border-slate-200 overflow-hidden shadow-inner">
              <AudioVisualizer isActive={isConnected} isSpeaking={isSpeaking} />
            </div>

            <div className="mt-3 flex justify-between text-xs font-mono text-slate-500">
              <span>IN: {isConnected ? '16kHz' : '---'}</span>
              <span>OUT: {isConnected ? '24kHz' : '---'}</span>
            </div>
          </div>

          <button
            onClick={() => isConnected ? stopSession() : startSession()}
            className={`w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-wide transition-all duration-200 shadow-lg active:translate-y-0.5 ${isConnected
              ? 'bg-gradient-to-r from-rose-500 to-red-500 text-white hover:from-rose-600 hover:to-red-600 shadow-rose-500/30'
              : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 shadow-emerald-500/30'
              }`}
          >
            {isConnected ? '🛑 End Session' : '🎙️ Start Learning'}
          </button>
        </div>
      </aside>

      {/* Main Learning Area */}
      <main className="flex-1 flex flex-col relative bg-gradient-to-br from-white to-slate-50">

        {/* Status Header */}
        <header className="h-16 flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center justify-between px-8 z-20 sticky top-0 shadow-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-full border border-slate-200">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-slate-400'}`}></div>
              <span className={`text-xs font-semibold uppercase tracking-wide ${isConnected ? 'text-emerald-600' : 'text-slate-500'}`}>
                {isConnected ? '✓ Connected' : 'Offline'}
              </span>
            </div>

            <div className="hidden md:flex items-center gap-4 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Module:</span>
                <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">{activeModule}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {error && (
              <div className="px-4 py-2 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
                <span className="text-xs font-semibold text-rose-600">{error}</span>
              </div>
            )}
            <div className="px-4 py-2 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg text-xs font-semibold text-purple-700 shadow-sm">
              🤖 AI Coach: Active
            </div>
          </div>
        </header>

        {/* Conversation Container */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar scroll-smooth"
          >
            {transcriptions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center select-none">
                <div className="w-32 h-32 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-emerald-500/20 relative animate-float">
                  <div className="absolute inset-0 rounded-full border-4 border-white/30"></div>
                  <span className="text-6xl">🎓</span>
                </div>
                <h2 className="text-2xl font-outfit font-bold text-slate-800 mb-3 tracking-tight">Ready to Learn English!</h2>
                <p className="text-sm text-slate-600 text-center max-w-md leading-relaxed">
                  {INITIAL_MESSAGE}<br />
                  <span className="text-emerald-600 font-medium">Click "Start Learning" to begin your practice session.</span>
                </p>

                <div className="mt-8 grid grid-cols-3 gap-4 text-center">
                  <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-2xl mb-2">🗣️</div>
                    <div className="text-xs font-semibold text-slate-700">Speak Naturally</div>
                  </div>
                  <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-2xl mb-2">👂</div>
                    <div className="text-xs font-semibold text-slate-700">Get Feedback</div>
                  </div>
                  <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-2xl mb-2">📈</div>
                    <div className="text-xs font-semibold text-slate-700">Track Progress</div>
                  </div>
                </div>
              </div>
            ) : (
              transcriptions.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex flex-col max-w-4xl w-full ${entry.role === 'user' ? 'items-end ml-auto' : 'items-start mr-auto'
                    } animate-fade-in-up`}
                >
                  <div className={`flex items-center gap-2 mb-2 ${entry.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${entry.role === 'user'
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      }`}>
                      {entry.role === 'user' ? '👤 You' : '🤖 AI Coach'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  <div className={`px-6 py-4 rounded-2xl border shadow-sm text-sm leading-relaxed max-w-[85%] ${entry.role === 'user'
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 border-blue-400 text-white rounded-tr-sm'
                    : 'bg-white border-slate-200 text-slate-800 rounded-tl-sm'
                    }`}>
                    {entry.text}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer Info Bar */}
        <footer className="h-12 border-t border-slate-200 bg-white flex items-center justify-between px-8 text-xs text-slate-500">
          <div className="flex items-center gap-6">
            <span className="font-semibold">English Mastery Portal</span>
            <span className="text-emerald-600">Powered by Google Gemini AI</span>
          </div>
          <div className="font-mono">Session: {isConnected ? Math.random().toString(36).substr(2, 8).toUpperCase() : '---'}</div>
        </footer>
      </main>
    </div>
  );
};

export default App;
