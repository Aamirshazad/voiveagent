
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { LearningModule, TranscriptionEntry, ConnectionState } from './types';
import { SYSTEM_INSTRUCTIONS, DEFAULT_MODULE, INITIAL_MESSAGE } from './constants';
import ModuleCard from './components/ModuleCard';
import AudioVisualizer from './components/AudioVisualizer';
import { createBlob, decode, decodeAudioData } from './services/audioService';
import {
  SESSION_CONFIG,
  SessionResumptionManager,
  ReconnectionManager,
} from './services/sessionService';

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
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isModelGenerating, setIsModelGenerating] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [goAwayWarning, setGoAwayWarning] = useState<string | null>(null);

  // Derived state
  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isReconnecting = connectionState === ConnectionState.RECONNECTING;

  // Refs for session management
  const sessionRef = useRef<any>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const currentTranscriptionsRef = useRef({ user: '', model: '' });
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Gemini 3.1 session management refs
  const resumptionManagerRef = useRef(new SessionResumptionManager());
  const reconnectionManagerRef = useRef(new ReconnectionManager());
  const activeModuleRef = useRef(activeModule);
  const connectionStateRef = useRef(connectionState);

  // Keep refs in sync
  useEffect(() => {
    activeModuleRef.current = activeModule;
  }, [activeModule]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  const initAudio = async () => {
    if (!audioContextsRef.current) {
      const input = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: SESSION_CONFIG.inputSampleRate,
      });
      const output = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: SESSION_CONFIG.outputSampleRate,
      });
      await input.audioWorklet.addModule('/audio-worklet.js');
      audioContextsRef.current = { input, output };
    }
    return audioContextsRef.current;
  };

  const clearAudioPlayback = useCallback(() => {
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setIsSpeaking(false);
  }, []);

  const startSession = useCallback(async (resumeHandle?: string | null) => {
    try {
      // Clean up any previous session before starting a new one
      if (sessionRef.current) {
        try { sessionRef.current.close(); } catch { /* ignore */ }
        sessionRef.current = null;
      }

      setConnectionState(resumeHandle ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING);
      setError(null);
      setGoAwayWarning(null);

      const ai = new GoogleGenAI({
        apiKey: process.env.API_KEY as string,
      });

      const { input: inputCtx } = await initAudio();

      // Only get new media stream if we don't have one
      if (!mediaStreamRef.current) {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const stream = mediaStreamRef.current;

      // Build config — only include sessionResumption when we have a real handle
      const liveConfig: Record<string, any> = {
        responseModalities: [Modality.AUDIO],
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTIONS[activeModuleRef.current] }],
        },
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        // Context window compression for unlimited sessions
        contextWindowCompression: {
          slidingWindow: {},
        },
      };

      // Only add sessionResumption if we have a valid handle
      if (resumeHandle) {
        liveConfig.sessionResumption = { handle: resumeHandle };
      }

      // Track whether audio pipeline has been set up for this session
      let audioStarted = false;

      const session = await ai.live.connect({
        model: SESSION_CONFIG.model,
        callbacks: {
          onopen: () => {
            console.log('[LiveAPI] WebSocket opened');
            // NOTE: Cannot reference `session` here — it's still in TDZ
            // sessionRef.current will be set after ai.live.connect() resolves
            connectionStateRef.current = ConnectionState.CONNECTED;
            setConnectionState(ConnectionState.CONNECTED);
            setError(null);
            setGoAwayWarning(null);
            reconnectionManagerRef.current.reset();

            // Delay audio pipeline setup to let server process the setup message
            setTimeout(() => {
              // Guard: only set up audio once per session, and only if still connected
              if (audioStarted || connectionStateRef.current !== ConnectionState.CONNECTED) return;
              if (!sessionRef.current) return; // Session not ready or was closed
              audioStarted = true;

              // Disconnect previous audio nodes if any
              if (sourceNodeRef.current) {
                try { sourceNodeRef.current.disconnect(); } catch { /* ignore */ }
              }
              if (scriptProcessorRef.current) {
                try { scriptProcessorRef.current.disconnect(); } catch { /* ignore */ }
              }

              // Set up audio input pipeline with AudioWorklet
              const source = inputCtx.createMediaStreamSource(stream);
              const workletNode = new AudioWorkletNode(inputCtx, 'audio-processor');

              workletNode.port.onmessage = (e) => {
                const inputData = e.data; // Float32Array from worklet
                // Use sessionRef.current — the local `session` const is in TDZ inside callbacks
                const currentSession = sessionRef.current;
                if (currentSession && connectionStateRef.current === ConnectionState.CONNECTED) {
                  const blob = createBlob(inputData);
                  try {
                    currentSession.sendRealtimeInput({
                      audio: {
                        mimeType: blob.mimeType,
                        data: blob.data
                      }
                    });
                  } catch (sendErr) {
                    console.debug('[LiveAPI] Audio send skipped:', (sendErr as Error).message);
                  }
                }
              };

              source.connect(workletNode);
              workletNode.connect(inputCtx.destination);

              // Store refs for cleanup
              sourceNodeRef.current = source;
              scriptProcessorRef.current = workletNode as any;

              console.log('[LiveAPI] Audio pipeline started');
            }, 300); // 300ms delay to let server process setup
          },

          onmessage: async (message: LiveServerMessage) => {
            // --- Audio playback ---
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              setIsSpeaking(true);
              setIsModelGenerating(true);
              const { output } = audioContextsRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, output.currentTime);
              const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                output,
                SESSION_CONFIG.outputSampleRate,
                1,
              );
              const bufferSource = output.createBufferSource();
              bufferSource.buffer = audioBuffer;
              bufferSource.connect(output.destination);
              bufferSource.onended = () => {
                sourcesRef.current.delete(bufferSource);
                if (sourcesRef.current.size === 0) setIsSpeaking(false);
              };
              bufferSource.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(bufferSource);
            }

            // --- Transcriptions ---
            if (message.serverContent?.inputTranscription) {
              currentTranscriptionsRef.current.user += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
              currentTranscriptionsRef.current.model += message.serverContent.outputTranscription.text;
            }

            // --- Turn complete ---
            if (message.serverContent?.turnComplete) {
              const { user, model } = currentTranscriptionsRef.current;
              if (user || model) {
                const newEntries: TranscriptionEntry[] = [];
                if (user) {
                  newEntries.push({ id: `u-${Date.now()}`, role: 'user', text: user, timestamp: Date.now() });
                }
                if (model) {
                  newEntries.push({ id: `m-${Date.now()}`, role: 'model', text: model, timestamp: Date.now() });
                }
                setTranscriptions(prev => [...prev, ...newEntries].slice(-30));
                currentTranscriptionsRef.current = { user: '', model: '' };
              }
            }

            // --- Generation complete (Gemini 3.1 new) ---
            if ((message.serverContent as any)?.generationComplete) {
              setIsModelGenerating(false);
            }

            // --- Interruption (barge-in) ---
            if (message.serverContent?.interrupted) {
              clearAudioPlayback();
            }

            // --- Session Resumption Update (Gemini 3.1 new) ---
            if ((message as any).sessionResumptionUpdate) {
              const update = (message as any).sessionResumptionUpdate;
              if (update.resumable && update.newHandle) {
                resumptionManagerRef.current.updateHandle(update.newHandle, true);
              }
            }

            // --- GoAway message (Gemini 3.1 new) ---
            if ((message as any).goAway) {
              const goAway = (message as any).goAway;
              const timeLeft = goAway.timeLeft || 'unknown';
              setGoAwayWarning(`Connection closing in ${timeLeft}. Reconnecting...`);

              // Proactively start reconnection before the server disconnects
              const handle = resumptionManagerRef.current.getHandle();
              if (handle) {
                setTimeout(() => {
                  stopSession(false, true); // Don't clear history, is auto-reconnect
                  startSession(handle);
                }, 500);
              }
            }
          },

          onerror: (e: any) => {
            console.error('[LiveAPI] Error:', e?.message || e);
            const handle = resumptionManagerRef.current.getHandle();

            if (handle && !reconnectionManagerRef.current.isExhausted()) {
              connectionStateRef.current = ConnectionState.RECONNECTING;
              setConnectionState(ConnectionState.RECONNECTING);
              setError(`Connection lost. Reconnecting (attempt ${reconnectionManagerRef.current.getAttempts() + 1})...`);

              reconnectionManagerRef.current.scheduleReconnect(() => {
                startSession(handle);
              });
            } else {
              setError('Connection lost. Please restart the session.');
              stopSession(false, false);
            }
          },

          onclose: (e: any) => {
            const code = e?.code || 'unknown';
            const reason = e?.reason || 'no reason';
            console.log(`[LiveAPI] WebSocket closed: code=${code}, reason=${reason}`);

            // Use the REF, not the stale closure variable!
            if (connectionStateRef.current !== ConnectionState.RECONNECTING) {
              connectionStateRef.current = ConnectionState.DISCONNECTED;
              setConnectionState(ConnectionState.DISCONNECTED);
            }
          },
        },
        config: liveConfig as any,
      });

      // Also set sessionRef here in case onopen hasn't fired yet
      sessionRef.current = session;

    } catch (err: any) {
      console.error('[LiveAPI] Session start error:', err);
      setError(err.message || 'Failed to initialize session.');
      connectionStateRef.current = ConnectionState.DISCONNECTED;
      setConnectionState(ConnectionState.DISCONNECTED);
    }
  }, [clearAudioPlayback]);

  const stopSession = useCallback(async (clearHistory: boolean = false, isAutoReconnect: boolean = false) => {
    // Disconnect audio input
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    // Close the Live API session
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch { /* ignore close errors */ }
      sessionRef.current = null;
    }

    if (!isAutoReconnect) {
      // Full stop — release media stream too
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }

      setConnectionState(ConnectionState.DISCONNECTED);
      reconnectionManagerRef.current.cancelPending();
      resumptionManagerRef.current.clear();
      resumptionManagerRef.current.resetSessionId();
    }

    setIsSpeaking(false);
    setIsModelGenerating(false);
    setGoAwayWarning(null);

    if (clearHistory) {
      setTranscriptions([]);
      currentTranscriptionsRef.current = { user: '', model: '' };
    }
  }, []);

  // Handle module switch — starts fresh session with new module
  const handleModuleSwitch = async (newModule: LearningModule) => {
    if (newModule === activeModule) return;
    await stopSession(true);
    setActiveModule(newModule);
    setError(null);
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcriptions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSession(false, false);
    };
  }, [stopSession]);

  const sessionId = resumptionManagerRef.current.getSessionId();

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
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50'
                  : isReconnecting ? 'bg-amber-500 animate-pulse shadow-lg shadow-amber-500/50'
                  : 'bg-slate-300'
                }`}></div>
                <span className="text-xs font-semibold text-slate-700">Voice Stream</span>
              </div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className={`w-1 h-3 rounded-full transition-all duration-300 ${isConnected ? 'bg-emerald-500' : isReconnecting ? 'bg-amber-500' : 'bg-slate-300'}`} style={{ opacity: isConnected ? 1 : 0.3 }}></div>)}
              </div>
            </div>

            <div className="h-14 flex items-center justify-center bg-white rounded-lg border border-slate-200 overflow-hidden shadow-inner">
              <AudioVisualizer isActive={isConnected} isSpeaking={isSpeaking} />
            </div>

            <div className="mt-3 flex justify-between text-xs font-mono text-slate-500">
              <span>IN: {isConnected ? `${SESSION_CONFIG.inputSampleRate / 1000}kHz` : '---'}</span>
              <span>OUT: {isConnected ? `${SESSION_CONFIG.outputSampleRate / 1000}kHz` : '---'}</span>
            </div>
          </div>

          <button
            onClick={() => isConnected || isReconnecting ? stopSession() : startSession()}
            disabled={connectionState === ConnectionState.CONNECTING}
            className={`w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-wide transition-all duration-200 shadow-lg active:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed ${
              isConnected || isReconnecting
                ? 'bg-gradient-to-r from-rose-500 to-red-500 text-white hover:from-rose-600 hover:to-red-600 shadow-rose-500/30'
                : connectionState === ConnectionState.CONNECTING
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-amber-500/30'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 shadow-emerald-500/30'
            }`}
          >
            {isConnected ? '🛑 End Session'
              : isReconnecting ? '🔄 Reconnecting...'
              : connectionState === ConnectionState.CONNECTING ? '⏳ Connecting...'
              : '🎙️ Start Learning'}
          </button>
        </div>
      </aside>

      {/* Main Learning Area */}
      <main className="flex-1 flex flex-col relative bg-gradient-to-br from-white to-slate-50">

        {/* Status Header */}
        <header className="h-16 flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center justify-between px-8 z-20 sticky top-0 shadow-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-full border border-slate-200">
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50'
                : isReconnecting ? 'bg-amber-500 shadow-lg shadow-amber-500/50'
                : 'bg-slate-400'
              }`}></div>
              <span className={`text-xs font-semibold uppercase tracking-wide ${
                isConnected ? 'text-emerald-600'
                : isReconnecting ? 'text-amber-600'
                : 'text-slate-500'
              }`}>
                {isConnected ? '✓ Connected' : isReconnecting ? '↻ Reconnecting' : 'Offline'}
              </span>
            </div>

            <div className="hidden md:flex items-center gap-4 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Module:</span>
                <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">{activeModule}</span>
              </div>
              {isModelGenerating && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-600 rounded-md border border-blue-200">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="font-medium">Generating</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {goAwayWarning && (
              <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                <span className="text-xs font-semibold text-amber-600">{goAwayWarning}</span>
              </div>
            )}
            {error && (
              <div className="px-4 py-2 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
                <span className="text-xs font-semibold text-rose-600">{error}</span>
              </div>
            )}
            <div className="px-4 py-2 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg text-xs font-semibold text-purple-700 shadow-sm">
              🤖 Gemini 3.1 Live
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

                <div className="mt-6 flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-200 rounded-lg">
                  <span className="text-xs font-semibold text-purple-700">✨ Powered by Gemini 3.1 Flash Live — Unlimited Sessions</span>
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
            <span className="text-emerald-600">Gemini 3.1 Flash Live</span>
            {resumptionManagerRef.current.canResume() && (
              <span className="text-purple-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                Session Resumable
              </span>
            )}
          </div>
          <div className="font-mono">Session: {isConnected || isReconnecting ? sessionId : '---'}</div>
        </footer>
      </main>
    </div>
  );
};

export default App;
