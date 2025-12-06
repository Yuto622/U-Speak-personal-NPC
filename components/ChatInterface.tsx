import React, { useState, useEffect, useRef } from 'react';
import { NPCConfig, Message, Role, VOICE_OPTIONS } from '../types';
import { geminiService } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

interface ChatInterfaceProps {
  config: NPCConfig;
  initialHistory: Message[];
  onSaveHistory: (history: Message[]) => void;
  onUpdateConfig: (config: NPCConfig) => void;
  onReset: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ config, initialHistory, onSaveHistory, onUpdateConfig, onReset }) => {
  const [history, setHistory] = useState<Message[]>(initialHistory);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Customization State
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [wardrobeInput, setWardrobeInput] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(config.voiceName || VOICE_OPTIONS[0].id);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [activeTab, setActiveTab] = useState<'appearance' | 'voice'>('appearance');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Initialize Audio Context
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
    return () => {
        audioContextRef.current?.close();
    };
  }, []);

  const playAudio = async (text: string) => {
    if (isMuted || !text) return;
    
    // Resume context if suspended (browser policy)
    if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
    }

    // Stop previous audio
    if (currentSourceRef.current) {
        currentSourceRef.current.stop();
        currentSourceRef.current = null;
    }

    setIsSpeaking(true);
    try {
        const audioBuffer = await geminiService.generateSpeech(text, config.voiceName);
        if (audioBuffer && audioContextRef.current) {
            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContextRef.current.destination);
            
            source.onended = () => {
                setIsSpeaking(false);
                currentSourceRef.current = null;
            };
            
            currentSourceRef.current = source;
            source.start();
        } else {
            setIsSpeaking(false);
        }
    } catch (e) {
        console.error("Error playing audio", e);
        setIsSpeaking(false);
    }
  };

  // Initialize Chat
  useEffect(() => {
    const initChat = async () => {
      try {
        await geminiService.startChat(config, initialHistory);
        
        // If no history, trigger greeting
        if (initialHistory.length === 0) {
          setIsLoading(true);
          const greeting = await geminiService.generateGreeting(config);
          const newMessage: Message = {
            id: Date.now().toString(),
            role: Role.MODEL,
            text: greeting,
            timestamp: Date.now()
          };
          setHistory([newMessage]);
          onSaveHistory([newMessage]);
          setIsLoading(false);
          // Play greeting
          playAudio(greeting);
        }
      } catch (error) {
        console.error("Failed to init chat", error);
      } finally {
        setIsInitializing(false);
      }
    };

    initChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isLoading]);

  const handleSendMessage = async (textOverride?: string) => {
    const textToSend = textOverride || inputText;
    if (!textToSend.trim() || isLoading) return;

    // Stop current speech if any
    if (currentSourceRef.current) {
        currentSourceRef.current.stop();
        setIsSpeaking(false);
    }

    // Add User Message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: Role.USER,
      text: textToSend,
      timestamp: Date.now()
    };

    const newHistory = [...history, userMsg];
    setHistory(newHistory);
    onSaveHistory(newHistory);
    setInputText('');
    setIsLoading(true);

    try {
      const responseText = await geminiService.sendMessage(textToSend);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: Role.MODEL,
        text: responseText,
        timestamp: Date.now()
      };
      
      const updatedHistory = [...newHistory, botMsg];
      setHistory(updatedHistory);
      onSaveHistory(updatedHistory);
      
      // Play Audio
      playAudio(responseText);

    } catch (error) {
      console.error("Send error", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: 'help' | 'easier' | 'topic') => {
    let prompt = "";
    switch(action) {
      case 'help': prompt = "Can you explain that last part in Japanese?"; break;
      case 'easier': prompt = "Please use simpler English."; break;
      case 'topic': prompt = "Let's change the topic. Ask me something interesting."; break;
    }
    handleSendMessage(prompt);
  };

  const handleUpdateAvatar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wardrobeInput.trim() || isGeneratingAvatar) return;

    setIsGeneratingAvatar(true);
    try {
      const newAvatarUrl = await geminiService.generateAvatar(config, wardrobeInput);
      if (newAvatarUrl) {
        const newConfig = { ...config, avatarImage: newAvatarUrl };
        onUpdateConfig(newConfig);
        setIsCustomizeOpen(false);
        setWardrobeInput('');
      }
    } catch (error) {
      console.error("Failed to update avatar", error);
    } finally {
      setIsGeneratingAvatar(false);
    }
  };

  const handleUpdateVoice = () => {
    const newConfig = { ...config, voiceName: selectedVoice };
    onUpdateConfig(newConfig);
    setIsCustomizeOpen(false);
  };

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-indigo-600 animate-pulse font-medium">Summoning {config.name}...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white relative overflow-hidden">
      
      {/* Prominent Avatar Layer ("Gattsuri" Display) */}
      <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
        {config.avatarImage ? (
          <img 
            src={config.avatarImage} 
            alt={config.name} 
            className={`h-[85%] w-full object-contain object-center opacity-100 drop-shadow-2xl transition-all duration-700 ease-out transform translate-y-4 ${
              isSpeaking ? 'animate-speak' : ''
            }`}
          />
        ) : (
          <div className="h-[50%] w-[50%] bg-indigo-50 rounded-full opacity-50 flex items-center justify-center">
             <span className="text-indigo-200 text-6xl font-bold">{config.name.charAt(0)}</span>
          </div>
        )}
        
        {/* Loading Overlay for Avatar */}
        {isGeneratingAvatar && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center backdrop-blur-sm z-10">
            <div className="flex flex-col items-center">
              <svg className="animate-spin h-10 w-10 text-indigo-600 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-indigo-800 font-medium">Changing Outfit...</span>
            </div>
          </div>
        )}
      </div>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-3 sticky top-0 z-10 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-700 font-bold text-lg overflow-hidden border border-gray-200 shadow-sm ${isSpeaking ? 'ring-2 ring-indigo-400' : ''}`}>
            {config.avatarImage ? (
              <img src={config.avatarImage} alt={config.name} className="w-full h-full object-cover" />
            ) : (
              config.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="overflow-hidden">
            <h2 className="font-bold text-gray-800 leading-tight truncate">{config.name}</h2>
            <p className="text-xs text-gray-500 truncate max-w-[100px] sm:max-w-xs">
              {config.relationship}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
            {/* Prominent Customize Button */}
            <button 
                onClick={() => setIsCustomizeOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-bold transition shadow-sm border border-gray-200"
            >
                <span className="text-sm">🎨</span>
                <span className="hidden sm:inline">カスタマイズ</span>
                <span className="sm:hidden">設定</span>
            </button>

            <button 
                onClick={() => setIsMuted(!isMuted)}
                className={`p-2 rounded-full transition ${isMuted ? 'text-gray-400 bg-gray-100' : 'text-indigo-600 bg-indigo-50'}`}
                title={isMuted ? "Unmute Voice" : "Mute Voice"}
            >
                {isMuted ? (
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                   </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                  </svg>
                )}
            </button>
            <button 
                onClick={() => {
                    if(window.confirm("Are you sure you want to reset? You will lose your chat history.")) {
                    onReset();
                    }
                }}
                className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 border border-red-200 rounded hover:bg-red-50 transition ml-1"
            >
            Reset
            </button>
        </div>
      </header>

      {/* Customization Modal */}
      {isCustomizeOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsCustomizeOpen(false)}></div>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm relative z-40 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gray-50 border-b border-gray-100 p-4">
               <h3 className="text-lg font-bold text-gray-800 text-center">カスタマイズ (Customize)</h3>
            </div>
            
            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                <button 
                  onClick={() => setActiveTab('appearance')}
                  className={`flex-1 py-3 text-sm font-medium transition ${activeTab === 'appearance' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-gray-500 bg-gray-50 hover:bg-gray-100'}`}
                >
                  外見 (Appearance)
                </button>
                <button 
                  onClick={() => setActiveTab('voice')}
                  className={`flex-1 py-3 text-sm font-medium transition ${activeTab === 'voice' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-gray-500 bg-gray-50 hover:bg-gray-100'}`}
                >
                  声 (Voice)
                </button>
            </div>

            <div className="p-6">
              {activeTab === 'appearance' ? (
                <>
                  <p className="text-sm text-gray-500 mb-4">{config.name}の服装を変更します。<br/>(例: 着物, サッカーのユニフォーム, スーツ...)</p>
                  <form onSubmit={handleUpdateAvatar}>
                    <input
                      type="text"
                      autoFocus
                      value={wardrobeInput}
                      onChange={(e) => setWardrobeInput(e.target.value)}
                      placeholder="e.g. Blue summer dress, Samurai armor..."
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <div className="flex gap-2 justify-end">
                      <button 
                        type="button" 
                        onClick={() => setIsCustomizeOpen(false)}
                        className="px-4 py-2 text-gray-600 font-medium text-sm hover:bg-gray-100 rounded-lg transition"
                      >
                        キャンセル
                      </button>
                      <button 
                        type="submit"
                        disabled={!wardrobeInput.trim()}
                        className="px-4 py-2 bg-indigo-600 text-white font-medium text-sm rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
                      >
                        変更する
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-4">{config.name}の声を変更します。</p>
                  <div className="space-y-2 mb-4">
                    {VOICE_OPTIONS.map((voice) => (
                       <label key={voice.id} className={`flex items-center p-3 rounded-lg border cursor-pointer transition ${selectedVoice === voice.id ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-200 hover:bg-gray-50'}`}>
                         <input 
                           type="radio" 
                           name="voice" 
                           value={voice.id} 
                           checked={selectedVoice === voice.id}
                           onChange={() => setSelectedVoice(voice.id)}
                           className="text-indigo-600 focus:ring-indigo-500"
                         />
                         <span className="ml-3 text-sm font-medium text-gray-700">{voice.label}</span>
                       </label>
                    ))}
                  </div>
                   <div className="flex gap-2 justify-end">
                      <button 
                        type="button" 
                        onClick={() => setIsCustomizeOpen(false)}
                        className="px-4 py-2 text-gray-600 font-medium text-sm hover:bg-gray-100 rounded-lg transition"
                      >
                        キャンセル
                      </button>
                      <button 
                        type="button"
                        onClick={handleUpdateVoice}
                        className="px-4 py-2 bg-indigo-600 text-white font-medium text-sm rounded-lg hover:bg-indigo-700 transition"
                      >
                        保存する
                      </button>
                    </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 sm:p-6 pb-24 scroll-smooth z-1 relative">
        {history.map((msg) => {
          const isUser = msg.role === Role.USER;
          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm text-[15px] leading-relaxed break-words backdrop-blur-sm transition-all duration-300 ${
                  isUser 
                    ? 'bg-indigo-600/85 text-white rounded-br-none shadow-indigo-200/50 hover:bg-indigo-600/95' 
                    : 'bg-white/85 text-gray-800 border border-gray-100/50 rounded-bl-none shadow-sm hover:bg-white/95'
                }`}
              >
                {isUser ? (
                  msg.text
                ) : (
                  <ReactMarkdown 
                    className="prose prose-sm max-w-none prose-p:my-0 prose-ul:my-0 prose-li:my-0"
                    components={{
                      p: ({node, ...props}) => <p {...props} className="mb-1 last:mb-0" />,
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          );
        })}
        
        {/* Loading Bubble */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/85 backdrop-blur-sm border border-gray-100/50 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
              <div className="flex space-x-1.5 h-full items-center">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white/80 backdrop-blur-md border-t border-gray-100 p-4 sticky bottom-0 z-20 pb-safe">
        
        {/* Quick Actions */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3 pb-1">
          <button onClick={() => handleQuickAction('help')} className="whitespace-nowrap px-3 py-1.5 bg-yellow-50/90 backdrop-blur-sm text-yellow-700 border border-yellow-200/50 rounded-full text-xs font-semibold hover:bg-yellow-100 transition shadow-sm">
            🇯🇵 Help in Japanese
          </button>
          <button onClick={() => handleQuickAction('easier')} className="whitespace-nowrap px-3 py-1.5 bg-green-50/90 backdrop-blur-sm text-green-700 border border-green-200/50 rounded-full text-xs font-semibold hover:bg-green-100 transition shadow-sm">
            👶 Easier English
          </button>
          <button onClick={() => handleQuickAction('topic')} className="whitespace-nowrap px-3 py-1.5 bg-blue-50/90 backdrop-blur-sm text-blue-700 border border-blue-200/50 rounded-full text-xs font-semibold hover:bg-blue-100 transition shadow-sm">
            🎲 New Topic
          </button>
        </div>

        <form 
          onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
          className="flex items-end gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 bg-gray-50/80 backdrop-blur-sm border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block w-full p-3 outline-none transition shadow-inner"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !inputText.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white p-3 rounded-xl transition shadow-md flex items-center justify-center min-w-[3rem]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;