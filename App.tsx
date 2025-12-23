
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { LearningModule, TranscriptionEntry } from './types';
import { SYSTEM_INSTRUCTIONS, DEFAULT_MODULE, INITIAL_MESSAGE } from './constants';
import ModuleCard from './components/ModuleCard';
import AudioVisualizer from './components/AudioVisualizer';
import { createBlob, decode, decodeAudioData } from './services/audioService';

const MODULE_ICONS: Record<LearningModule, string> = {
  [LearningModule.SALES_PRESENCE]: '🎙️',
  [LearningModule.PRODUCT_PITCH]: '🚀',
  [LearningModule.BIZ_DEV]: '🤝',
  [LearningModule.PM_STRATEGY]: '📊',
  [LearningModule.NEGOTIATION]: '⚖️',
  [LearningModule.MARKET_INTEL]: '🌐'
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

  const stopSession = async () => {
    if (sessionPromiseRef.current) {
      const session = await sessionPromiseRef.current;
      session.close();
      sessionPromiseRef.current = null;
    }
    setIsConnected(false);
    setIsSpeaking(false);
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcriptions]);

  return (
    <div className="flex h-screen bg-[#020617] text-slate-200 overflow-hidden font-inter selection:bg-indigo-500/30">
      
      {/* Sidebar: Command & Control */}
      <aside className="w-80 flex-shrink-0 bg-[#0B1121] border-r border-slate-800/60 flex flex-col z-20 shadow-2xl relative">
        <div className="p-6 border-b border-slate-800/60 bg-[#0B1121] z-10">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center font-outfit font-black text-white shadow-lg shadow-indigo-600/20 border border-indigo-400/20">
              FG
            </div>
            <div>
              <h1 className="font-outfit font-bold text-lg tracking-tight text-white leading-none">FluentGenie</h1>
              <p className="text-[10px] uppercase tracking-[0.25em] text-indigo-400 font-semibold mt-1">Enterprise</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
          <div>
            <div className="flex items-center justify-between px-2 mb-4">
               <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Training Protocol</h2>
               <span className="text-[9px] font-mono text-slate-600 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">V.2.5</span>
            </div>
            <div className="space-y-3">
              {(Object.values(LearningModule) as LearningModule[]).map((m) => (
                <ModuleCard
                  key={m}
                  module={m}
                  isActive={activeModule === m}
                  icon={MODULE_ICONS[m]}
                  onClick={() => {
                    setActiveModule(m);
                    if (isConnected) setError("Protocol switch detected. Reset required.");
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Biometrics Panel */}
        <div className="p-4 bg-[#0F172A] border-t border-slate-800/60 z-10">
           <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 mb-4 shadow-inner">
             <div className="flex justify-between items-center mb-3">
               <div className="flex items-center gap-2">
                 <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}></div>
                 <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Voice Stream</span>
               </div>
               <div className="flex gap-0.5">
                 {[1,2,3,4,5].map(i => <div key={i} className={`w-0.5 h-2 rounded-full transition-all duration-300 ${isConnected ? 'bg-indigo-500' : 'bg-slate-800'}`} style={{opacity: isConnected ? 1 : 0.3}}></div>)}
               </div>
             </div>
             
             <div className="h-12 flex items-center justify-center bg-slate-950/50 rounded-lg border border-slate-800/50 overflow-hidden">
                <AudioVisualizer isActive={isConnected} isSpeaking={isSpeaking} />
             </div>
             
             <div className="mt-3 flex justify-between text-[9px] font-mono text-slate-500">
                <span>IN: {isConnected ? '16kHz PCM' : '---'}</span>
                <span>OUT: {isConnected ? '24kHz PCM' : '---'}</span>
             </div>
           </div>
           
           <button 
             onClick={() => isConnected ? stopSession() : startSession()}
             className={`w-full py-3.5 rounded-lg font-bold text-[11px] uppercase tracking-[0.15em] transition-all duration-200 border shadow-lg active:translate-y-0.5 ${
               isConnected 
                 ? 'bg-rose-950/30 text-rose-500 border-rose-500/30 hover:bg-rose-900/50 hover:border-rose-500/50 shadow-rose-900/10' 
                 : 'bg-indigo-600 text-white border-indigo-400/30 hover:bg-indigo-500 hover:border-indigo-300/50 shadow-indigo-900/20'
             }`}
           >
             {isConnected ? 'End Session' : 'Start Session'}
           </button>
        </div>
      </aside>

      {/* Main Terminal Area */}
      <main className="flex-1 flex flex-col relative bg-[#020617] bg-grid">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/5 via-transparent to-slate-900/20 pointer-events-none"></div>
        
        {/* Status Header */}
        <header className="h-14 flex-shrink-0 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md flex items-center justify-between px-6 z-20 sticky top-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-900 rounded-full border border-slate-800">
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-slate-600'}`}></div>
              <span className={`text-[10px] font-mono font-medium uppercase tracking-wider ${isConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                {isConnected ? 'System Online' : 'Offline'}
              </span>
            </div>
            
            <div className="hidden md:flex items-center gap-2 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
               <span>LATENCY: {isConnected ? '24ms' : '--'}</span>
               <span className="text-slate-700">|</span>
               <span>MODEL: Gemini-2.5-Native</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
             {error && (
                <div className="px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-md flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></span>
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wide">{error}</span>
                </div>
             )}
             <div className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded text-[10px] font-bold text-indigo-300 uppercase tracking-wider shadow-[0_0_10px_rgba(99,102,241,0.1)]">
               Affective Dialog: ON
             </div>
          </div>
        </header>

        {/* Transcript Container */}
        <div className="flex-1 overflow-hidden relative flex flex-col z-10">
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar scroll-smooth"
          >
            {transcriptions.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center select-none">
                 <div className="w-32 h-32 bg-gradient-to-tr from-slate-900 to-slate-800 rounded-full border border-slate-700/50 flex items-center justify-center mb-8 shadow-2xl relative">
                   <div className="absolute inset-0 rounded-full border border-white/5"></div>
                   <span className="text-5xl opacity-50 grayscale">🎙️</span>
                 </div>
                 <h2 className="text-xl font-outfit font-bold text-slate-200 mb-3 tracking-tight">Ready to Practice</h2>
                 <p className="text-xs font-mono text-slate-500 text-center max-w-sm leading-relaxed">
                   {INITIAL_MESSAGE}<br/>
                   <span className="opacity-50">Microphone access required for real-time coaching.</span>
                 </p>
               </div>
            ) : (
              transcriptions.map((entry) => (
                <div 
                  key={entry.id} 
                  className={`flex flex-col max-w-4xl w-full ${
                    entry.role === 'user' ? 'items-end ml-auto' : 'items-start mr-auto'
                  } animate-fade-in-up`}
                >
                  <div className={`flex items-center gap-2 mb-1.5 ${entry.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                     <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${
                      entry.role === 'user' 
                        ? 'bg-indigo-950/30 border-indigo-500/30 text-indigo-300' 
                        : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                    }`}>
                      {entry.role === 'user' ? 'You' : 'Coach'}
                    </span>
                    <span className="text-[9px] font-mono text-slate-600">
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  
                  <div className={`px-6 py-4 rounded-lg border backdrop-blur-sm shadow-sm text-sm leading-relaxed max-w-[90%] md:max-w-[80%] ${
                    entry.role === 'user' 
                      ? 'bg-indigo-600/10 border-indigo-500/20 text-indigo-50 rounded-tr-none' 
                      : 'bg-[#0F172A]/80 border-slate-700/50 text-slate-200 rounded-tl-none'
                  }`}>
                    {entry.text}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer Info Bar */}
        <footer className="h-9 border-t border-slate-800/60 bg-[#0B1121] flex items-center justify-between px-6 text-[9px] font-mono text-slate-600 uppercase tracking-wider z-20">
           <div className="flex items-center gap-4">
             <span>FluentGenie Enterprise</span>
           </div>
           <div>SESSION ID: {isConnected ? Math.random().toString(36).substr(2, 8).toUpperCase() : '---'}</div>
        </footer>
      </main>
    </div>
  );
};

export default App;
