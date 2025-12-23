
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
  [LearningModule.BIZ_DEV]: '💼',
  [LearningModule.PM_STRATEGY]: '📊',
  [LearningModule.NEGOTIATION]: '⚖️',
  [LearningModule.LEADERSHIP]: '👑'
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
      // Use v1alpha for Affective Dialog support as requested
      const ai = new GoogleGenAI({ 
        apiKey: process.env.API_KEY as string,
        httpOptions: { "apiVersion": "v1alpha" }
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
                setTranscriptions(prev => [...prev, ...newEntries].slice(-15));
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
            setError("Connection degraded. Re-establishing executive line.");
            stopSession();
          },
          onclose: () => setIsConnected(false)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          // AFFECTIVE DIALOG: Adapt coach tone to user input emotional state
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
      setError(err.message || "Training session failed to initialize.");
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
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col font-inter">
      {/* Executive Header */}
      <header className="bg-[#1E293B] border-b border-blue-500/30 px-8 py-5 flex justify-between items-center shadow-2xl z-50">
        <div className="flex items-center gap-8">
          <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-900 rounded-xl font-outfit font-black text-2xl shadow-[0_0_20px_rgba(37,99,235,0.2)] border border-blue-400/20">
            FG
          </div>
          <div>
            <h1 className="text-xl font-black font-outfit tracking-tighter leading-none text-white uppercase italic">FluentGenie Pro</h1>
            <p className="text-[9px] text-blue-400 font-black tracking-[0.4em] mt-2 uppercase opacity-80">Career Acquisition OS</p>
          </div>
        </div>

        <div className="flex items-center gap-12">
          <div className="hidden lg:flex items-center gap-10 text-[10px] font-black text-slate-500 tracking-[0.2em] uppercase">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'bg-slate-700'}`}></div>
              <span>Network: {isConnected ? 'Stable' : 'Offline'}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)] animate-pulse' : 'bg-slate-700'}`}></div>
              <span>Analysis: {isSpeaking ? 'Affective' : 'Listening'}</span>
            </div>
          </div>
          
          <button 
            onClick={() => isConnected ? stopSession() : startSession()}
            className={`px-10 py-3 rounded-xl font-black text-xs uppercase tracking-[0.25em] transition-all border-2 active:scale-95 ${
              isConnected 
                ? 'bg-red-500/10 border-red-500/40 text-red-500 hover:bg-red-500 hover:text-white' 
                : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700 hover:border-blue-400 shadow-2xl shadow-blue-600/30'
            }`}
          >
            {isConnected ? 'Terminate Session' : 'Engage Accelerator'}
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row p-8 gap-10 max-w-[1920px] mx-auto w-full">
        {/* Left: Specialized Tracks */}
        <aside className="lg:w-[460px] flex flex-col gap-8">
          <div className="bg-[#1E293B] rounded-[2.5rem] p-10 shadow-2xl border border-blue-500/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-[100px] -mr-32 -mt-32"></div>
            <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mb-10 flex items-center justify-between relative z-10">
              Training Tracks
              <span className="bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full text-[9px] font-black border border-blue-500/20">AFFECTIVE 12-2025</span>
            </h2>
            <div className="space-y-4 relative z-10">
              {(Object.values(LearningModule) as LearningModule[]).map((m) => (
                <ModuleCard
                  key={m}
                  module={m}
                  isActive={activeModule === m}
                  icon={MODULE_ICONS[m]}
                  onClick={() => {
                    setActiveModule(m);
                    if (isConnected) setError("Context shift detected. Session restart required.");
                  }}
                />
              ))}
            </div>
          </div>

          <div className="bg-[#1E293B] rounded-[2.5rem] p-10 text-white shadow-2xl border border-slate-700/40 relative overflow-hidden">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Biometric Audio Feed</h3>
              <div className="flex gap-1.5">
                {[1,2,3].map(i => <div key={i} className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse"></div>)}
              </div>
            </div>
            <div className="flex items-center gap-8 mb-10">
              <div className={`w-20 h-20 rounded-3xl bg-slate-800 flex items-center justify-center text-4xl border border-slate-700 transition-all duration-700 ${isSpeaking ? 'scale-110 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] rotate-2' : ''}`}>
                💼
              </div>
              <div>
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-2">Instructor: Kore</p>
                <p className="text-lg font-black text-slate-200 tracking-tight">
                  {isSpeaking ? 'Processing Tone...' : isConnected ? 'Signal Active' : 'Offline'}
                </p>
              </div>
            </div>
            <AudioVisualizer isActive={isConnected} isSpeaking={isSpeaking} />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-[2rem] flex items-center gap-5 animate-in fade-in slide-in-from-left-6">
              <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center text-xl">⚠️</div>
              <p className="text-[11px] font-black text-red-400 leading-tight uppercase tracking-widest">{error}</p>
            </div>
          )}
        </aside>

        {/* Center: Communication Terminal */}
        <main className="flex-1 flex flex-col bg-[#1E293B] rounded-[3rem] shadow-2xl border border-blue-500/5 overflow-hidden relative">
          <div className="bg-slate-800/60 px-12 py-8 border-b border-slate-700/40 flex justify-between items-center">
            <div className="flex items-center gap-8">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em]">Strategy Transcript</span>
              <div className="h-5 w-px bg-slate-700"></div>
              <span className="text-[10px] font-black text-blue-400 bg-blue-500/15 border border-blue-500/25 px-5 py-2 rounded-full uppercase tracking-[0.15em]">{activeModule}</span>
            </div>
            <div className="hidden md:flex text-[10px] font-black text-slate-600 uppercase tracking-[0.25em] gap-10">
              <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full opacity-50"></div>Engine: 12-2025</span>
              <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full opacity-50"></div>Affective: Enabled</span>
            </div>
          </div>

          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-12 py-12 space-y-10 scroll-smooth custom-scrollbar"
          >
            {transcriptions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-12">
                <div className="relative group">
                   <div className="w-32 h-32 bg-slate-800/50 rounded-[3rem] flex items-center justify-center text-6xl opacity-20 transition-all duration-700 group-hover:opacity-40 group-hover:scale-110">👑</div>
                   <div className="absolute -inset-8 border-2 border-blue-500/10 rounded-[4rem] animate-pulse"></div>
                </div>
                <div>
                  <h3 className="text-3xl font-black text-white tracking-tighter leading-tight mb-6">{INITIAL_MESSAGE}</h3>
                  <p className="text-slate-400 text-base font-medium leading-relaxed max-w-lg mx-auto opacity-70">
                    Your verbal performance and emotional resonance are analyzed in real-time. The AI shifts its coaching persona based on your vocal conviction.
                  </p>
                </div>
              </div>
            ) : (
              transcriptions.map((entry) => (
                <div 
                  key={entry.id} 
                  className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}
                >
                  <div className={`max-w-[80%] px-10 py-6 rounded-[2.5rem] transition-all shadow-2xl relative ${
                    entry.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700/50'
                  }`}>
                    <p className="text-[17px] leading-[1.7] font-semibold tracking-tight">{entry.text}</p>
                    <div className={`mt-4 flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.25em] ${entry.role === 'user' ? 'text-blue-200' : 'text-blue-500'}`}>
                      {entry.role === 'user' ? 'Linguistic Practitioner' : 'Executive AI Advisor'} • {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Strategic Briefing Area */}
          <div className="p-12 bg-slate-800/50 border-t border-slate-700/40">
            <div className="flex gap-10 items-start">
              <div className="w-16 h-16 bg-blue-600/15 border border-blue-500/40 rounded-3xl flex items-center justify-center text-3xl shrink-0 text-blue-400 shadow-xl">💡</div>
              <div>
                <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4">Strategic Protocol</h4>
                <p className="text-[15px] font-semibold text-slate-300 leading-relaxed max-w-4xl opacity-90">
                  Leverage <strong>Affective Feedback</strong>. The model detects your confidence level. Try to maintain a steady, low-pitched delivery during the 'Ask'. If you're practicing BizDev, ask for: "How should I structure the partnership ROI slide?"
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>

      <footer className="py-8 px-12 border-t border-slate-800 bg-[#0F172A] flex flex-col md:flex-row justify-between items-center gap-8">
        <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em]">© 2025 FluentGenie OS • Advanced Linguistic Career Accelerator</p>
        <div className="flex gap-12 text-[10px] font-black text-slate-600 uppercase tracking-[0.25em]">
          <span className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>AI: Gemini-2.5-Native-Audio</span>
          <span className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>Protocol: Affective-v1alpha</span>
          <span className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>Status: Pipeline Encrypted</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
