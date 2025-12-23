
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Scenario, TranscriptionEntry } from './types';
import { SYSTEM_INSTRUCTIONS, DEFAULT_SCENARIO, INITIAL_MESSAGE } from './constants';
import ScenarioCard from './components/ScenarioCard';
import AudioVisualizer from './components/AudioVisualizer';
import { createBlob, decode, decodeAudioData } from './services/audioService';

const SCENARIO_ICONS: Record<Scenario, string> = {
  [Scenario.CASUAL]: '👋',
  [Scenario.JOB_INTERVIEW]: '💼',
  [Scenario.TECH_PITCH]: '🚀',
  [Scenario.COFFEE_SHOP]: '☕',
  [Scenario.AIRPORT]: '✈️',
  [Scenario.ACCENT_CLINIC]: '🗣️'
};

const App: React.FC = () => {
  const [activeScenario, setActiveScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const currentTranscriptionsRef = useRef({ user: '', model: '' });

  // Initialize Audio Contexts
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
      const apiKey = (process.env as any).API_KEY;
      if (!apiKey) {
        throw new Error("API Key is missing in environment variables.");
      }
      const ai = new GoogleGenAI({ apiKey });
      const { input: inputCtx, output: outputCtx } = await initAudio();
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setError(null);
            
            // Start audio capture
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Data - Fixed optional chaining for TS
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              setIsSpeaking(true);
              const { output } = audioContextsRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, output.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), output, 24000, 1);
              const source = output.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(output.destination);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsSpeaking(false);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Handle Transcriptions
            if (message.serverContent?.inputTranscription) {
              currentTranscriptionsRef.current.user += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
              currentTranscriptionsRef.current.model += message.serverContent.outputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const { user, model } = currentTranscriptionsRef.current;
              if (user || model) {
                const newEntries: TranscriptionEntry[] = [];
                if (user) newEntries.push({ id: Math.random().toString(), role: 'user', text: user, timestamp: Date.now() });
                if (model) newEntries.push({ id: Math.random().toString(), role: 'model', text: model, timestamp: Date.now() });
                
                setTranscriptions(prev => [...prev, ...newEntries].slice(-20));
                currentTranscriptionsRef.current = { user: '', model: '' };
              }
            }

            // Handle Interruptions
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onerror: (e) => {
            console.error('Session error:', e);
            setError("Connection error. Please check your network.");
            stopSession();
          },
          onclose: () => {
            setIsConnected(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTIONS[activeScenario],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to start session. Ensure microphone access is granted.");
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

  const handleToggleSession = () => {
    if (isConnected) stopSession();
    else startSession();
  };

  // Scroll transcription to bottom
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptions]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-inter">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-4 py-3 md:px-8 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-2xl font-outfit">F</div>
          <h1 className="text-xl font-bold font-outfit text-slate-800 tracking-tight hidden sm:block">FluentGenie</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 ${isConnected ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></span>
            {isConnected ? 'LIVE SESSION' : 'OFFLINE'}
          </div>
          <button 
            onClick={handleToggleSession}
            className={`px-6 py-2 rounded-full font-bold transition-all ${
              isConnected 
                ? 'bg-red-50 text-red-600 hover:bg-red-100' 
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
            }`}
          >
            {isConnected ? 'End Session' : 'Start Session'}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Controls & Scenarios */}
        <div className="lg:col-span-4 space-y-8">
          <section>
            <h2 className="text-lg font-bold mb-4 text-slate-800 flex items-center gap-2">
              <span className="p-1.5 bg-blue-100 rounded-lg text-blue-600">🎯</span>
              Choose Practice Mode
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {(Object.values(Scenario) as Scenario[]).map((scenario) => (
                <ScenarioCard
                  key={scenario}
                  scenario={scenario}
                  isActive={activeScenario === scenario}
                  icon={SCENARIO_ICONS[scenario]}
                  onClick={() => {
                    setActiveScenario(scenario);
                    if (isConnected) {
                      setError("Restart session to apply new scenario.");
                    }
                  }}
                />
              ))}
            </div>
          </section>

          <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
             <h3 className="font-bold text-slate-800">Your AI Coach</h3>
             <div className="flex items-center gap-4">
               <div className="relative">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-3xl shadow-lg transition-transform ${isSpeaking ? 'scale-110' : ''}`}>
                    🤖
                  </div>
                  {isSpeaking && <div className="absolute inset-0 pulse-ring rounded-2xl bg-blue-400"></div>}
               </div>
               <div>
                 <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Coach Kore</p>
                 <p className="text-slate-800 font-semibold">{isSpeaking ? 'Speaking...' : isConnected ? 'Listening...' : 'Ready to start'}</p>
               </div>
             </div>
             <AudioVisualizer isActive={isConnected} isSpeaking={isSpeaking} />
          </section>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl text-sm font-medium flex items-start gap-3">
              <span>⚠️</span>
              {error}
            </div>
          )}
        </div>

        {/* Right Column: Transcription & Visual Feed */}
        <div className="lg:col-span-8 flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-md flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 tracking-widest uppercase">Live Transcription</span>
              <span className="text-xs text-blue-500 font-medium">Auto-scrolling</span>
            </div>
            
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
            >
              {transcriptions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-4xl">📝</div>
                  <div>
                    <h3 className="text-slate-800 font-bold text-lg">{INITIAL_MESSAGE}</h3>
                    <p className="text-slate-500 mt-2 max-w-xs mx-auto">Click "Start Session" to begin your real-time conversation and see transcriptions here.</p>
                  </div>
                </div>
              ) : (
                transcriptions.map((entry) => (
                  <div 
                    key={entry.id} 
                    className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] px-5 py-3 rounded-2xl text-sm leading-relaxed ${
                      entry.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-tr-none' 
                        : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
                    }`}>
                      <p>{entry.text}</p>
                      <span className={`text-[10px] mt-1 block opacity-60 ${entry.role === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Input area indicator */}
            <div className="p-4 bg-white border-t border-slate-100">
               {isConnected ? (
                 <div className="flex items-center gap-3 text-sm text-blue-600 animate-pulse font-medium justify-center">
                   <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                   Gemini is listening for your voice...
                 </div>
               ) : (
                 <div className="text-sm text-slate-400 text-center font-medium">
                   Start session to activate microphone
                 </div>
               )}
            </div>
          </div>

          <div className="mt-6 p-4 bg-yellow-50 rounded-2xl border border-yellow-100 text-yellow-800 text-sm flex items-start gap-4">
             <span className="text-xl">💡</span>
             <div>
                <p className="font-bold">Pro Tip</p>
                <p className="opacity-80">Ask for specific feedback! You can say: "How was my pronunciation of that last sentence?" or "Did I use any filler words?"</p>
             </div>
          </div>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="py-6 px-8 text-center text-slate-400 text-xs font-medium">
        Powered by Gemini 2.5 Live API • Optimized for American English Accent Training
      </footer>
    </div>
  );
};

export default App;
