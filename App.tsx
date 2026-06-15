import React, { useState, useEffect } from 'react';
import Onboarding from './components/Onboarding';
import ChatInterface from './components/ChatInterface';
import SalesDashboard from './components/SalesDashboard';
import { NPCConfig, Message } from './types';

const STORAGE_KEY_CONFIG = 'uspeak_npc_config';
const STORAGE_KEY_HISTORY = 'uspeak_chat_history';

const App: React.FC = () => {
  const [npcConfig, setNpcConfig] = useState<NPCConfig | null>(null);
  const [history, setHistory] = useState<Message[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [route, setRoute] = useState(() => window.location.hash.replace('#', ''));

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.replace('#', ''));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const storedConfig = localStorage.getItem(STORAGE_KEY_CONFIG);
    const storedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);

    if (storedConfig) {
      try {
        setNpcConfig(JSON.parse(storedConfig));
      } catch (e) {
        console.error("Failed to parse config", e);
      }
    }

    if (storedHistory) {
      try {
        setHistory(JSON.parse(storedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
    setIsLoaded(true);
  }, []);

  const handleCreateNPC = (config: NPCConfig) => {
    setNpcConfig(config);
    setHistory([]);
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
    localStorage.removeItem(STORAGE_KEY_HISTORY);
  };

  const handleUpdateConfig = (newConfig: NPCConfig) => {
    setNpcConfig(newConfig);
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(newConfig));
  };

  const handleSaveHistory = (newHistory: Message[]) => {
    setHistory(newHistory);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(newHistory));
  };

  const handleReset = () => {
    setNpcConfig(null);
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY_CONFIG);
    localStorage.removeItem(STORAGE_KEY_HISTORY);
  };

  if (!isLoaded) return null;

  // 営業成績ダッシュボード（#dashboard / #sales でアクセス）
  if (route === 'dashboard' || route === 'sales') {
    return <SalesDashboard />;
  }

  return (
    <div className="font-sans antialiased text-gray-900 bg-white h-screen w-full">
      {!npcConfig ? (
        <Onboarding onComplete={handleCreateNPC} />
      ) : (
        <ChatInterface 
          config={npcConfig} 
          initialHistory={history}
          onSaveHistory={handleSaveHistory}
          onUpdateConfig={handleUpdateConfig}
          onReset={handleReset}
        />
      )}
    </div>
  );
};

export default App;