import React, { useState } from 'react';
import { NPCConfig, RELATIONSHIP_OPTIONS, PERSONALITY_OPTIONS, SPEAKING_STYLE_OPTIONS, LEARNING_GOAL_OPTIONS, VOICE_OPTIONS } from '../types';
import { geminiService } from '../services/geminiService';

interface OnboardingProps {
  onComplete: (config: NPCConfig) => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState(RELATIONSHIP_OPTIONS[0]);
  const [personality, setPersonality] = useState(PERSONALITY_OPTIONS[0]);
  const [customPersonality, setCustomPersonality] = useState('');
  const [speakingStyle, setSpeakingStyle] = useState(SPEAKING_STYLE_OPTIONS[0]);
  const [voiceName, setVoiceName] = useState(VOICE_OPTIONS[0].id);
  const [learningGoals, setLearningGoals] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const toggleGoal = (goal: string) => {
    setLearningGoals(prev => 
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isGenerating) return;

    setIsGenerating(true);

    const finalPersonality = customPersonality.trim() ? customPersonality : personality;

    const partialConfig: NPCConfig = {
      name,
      relationship,
      personality: finalPersonality,
      speakingStyle,
      learningGoals: learningGoals.length > 0 ? learningGoals : ['General English'],
      voiceName,
    };

    // Generate Avatar
    let avatarImage: string | undefined;
    try {
      avatarImage = await geminiService.generateAvatar(partialConfig);
    } catch (error) {
      console.error("Failed to generate avatar, proceeding without one.", error);
    }

    const finalConfig: NPCConfig = {
      ...partialConfig,
      avatarImage
    };

    onComplete(finalConfig);
    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-purple-100 p-4 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 md:p-8 overflow-y-auto max-h-[95vh]">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-900 tracking-tight">U-Speak</h1>
          <p className="text-indigo-600 font-medium">Your Personal NPC English Buddy</p>
          <p className="text-sm text-gray-500 mt-2">Design your perfect conversation partner.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">NPC Name (名前)</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Alex, Sarah, Sensei..."
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              disabled={isGenerating}
            />
          </div>

          {/* Relationship */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Relationship (関係性)</label>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              disabled={isGenerating}
            >
              {RELATIONSHIP_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Personality */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Personality (性格)</label>
            <select
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none bg-white mb-2"
              disabled={isGenerating}
            >
              {PERSONALITY_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <input
              type="text"
              value={customPersonality}
              onChange={(e) => setCustomPersonality(e.target.value)}
              placeholder="Or type custom personality..."
              className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              disabled={isGenerating}
            />
          </div>

          {/* Voice Selection - NEW */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Voice (声の選択)</label>
            <select
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              disabled={isGenerating}
            >
              {VOICE_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Style */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Speaking Style (話し方)</label>
            <select
              value={speakingStyle}
              onChange={(e) => setSpeakingStyle(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              disabled={isGenerating}
            >
              {SPEAKING_STYLE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Goals */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Learning Goals (学習目的)</label>
            <div className="flex flex-wrap gap-2">
              {LEARNING_GOAL_OPTIONS.map(goal => (
                <button
                  key={goal}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => toggleGoal(goal)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                    learningGoals.includes(goal)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                  }`}
                >
                  {goal}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isGenerating}
            className={`w-full text-white font-bold py-4 rounded-xl shadow-lg transform transition active:scale-95 mt-4 flex items-center justify-center ${
              isGenerating ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isGenerating ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Summoning your 3D Avatar...</span>
              </span>
            ) : (
              "NPCを作成する"
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Onboarding;