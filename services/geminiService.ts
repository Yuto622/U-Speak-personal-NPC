import { GoogleGenAI, Chat, Content, Modality } from "@google/genai";
import { NPCConfig, Message, Role } from '../types';

// Helper to convert internal Message type to Gemini Content type for history
const mapMessagesToHistory = (messages: Message[]): Content[] => {
  return messages.map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));
};

const getSystemInstruction = (config: NPCConfig): string => {
  return `
    You are ${config.name}.
    Relationship to user: ${config.relationship}.
    Personality: ${config.personality}.
    Speaking Style: ${config.speakingStyle}.
    The user's learning goals: ${config.learningGoals.join(', ')}.

    CORE INSTRUCTIONS:
    1. Speak English 95% of the time. The goal is immersion.
    2. Only speak Japanese if the user explicitly asks for a translation, explanation, or help, or if they seem completely stuck.
    3. Stay in character AT ALL TIMES. Do not break the fourth wall unless explaining grammar.
    4. Keep responses concise and conversational (under 50 words usually), unless a long explanation is requested.
    5. If the user makes a mistake, you can correct them gently (or sarcastically, depending on personality), but keep the flow going.
    6. Initiate the conversation based on your persona.
  `;
};

// Audio Decoding Helpers
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export class GeminiService {
  private ai: GoogleGenAI;
  private chatSession: Chat | null = null;
  private modelName = 'gemini-2.5-flash';
  private imageModelName = 'gemini-2.5-flash-image';
  private ttsModelName = 'gemini-2.5-flash-preview-tts';

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  // Initialize or Restore a Chat Session
  async startChat(config: NPCConfig, previousHistory: Message[] = []): Promise<void> {
    const history = mapMessagesToHistory(previousHistory);
    
    this.chatSession = this.ai.chats.create({
      model: this.modelName,
      config: {
        systemInstruction: getSystemInstruction(config),
        temperature: 0.9, // Higher temperature for more personality
      },
      history: history
    });
  }

  // Send a message to the NPC
  async sendMessage(text: string): Promise<string> {
    if (!this.chatSession) {
      throw new Error("Chat session not initialized.");
    }

    try {
      const response = await this.chatSession.sendMessage({ message: text });
      return response.text || "";
    } catch (error) {
      console.error("Gemini API Error:", error);
      return "Sorry, I lost my train of thought. Can you say that again?";
    }
  }

  // Generate an initial greeting if the history is empty
  async generateGreeting(config: NPCConfig): Promise<string> {
    if (!this.chatSession) {
        await this.startChat(config, []);
    }

    try {
        const response = await this.chatSession!.sendMessage({ 
            message: "Start the conversation now. Greet the user based on your persona and context." 
        });
        return response.text || "Hello! Nice to meet you.";
    } catch (e) {
        return `Hi, I'm ${config.name}. Ready to chat?`;
    }
  }

  // Generate a 3D RPG style avatar for the NPC
  async generateAvatar(config: NPCConfig, appearanceOverride?: string): Promise<string | undefined> {
    try {
      const appearancePrompt = appearanceOverride 
        ? `Outfit/Appearance: ${appearanceOverride}.`
        : `Appearance: Ensure the character's outfit and accessories match their personality (e.g., glasses for serious, hoodie for casual).`;

      const prompt = `Generate a full-body 3D character avatar in a cute voxel or low-poly RPG style (like Minecraft or Cube World).
      Character Name: ${config.name}.
      Role: ${config.relationship}.
      Personality: ${config.personality}.
      Style: ${config.speakingStyle}.
      ${appearancePrompt}
      Pose: Standing confidently, facing forward, full body fully visible from head to toe.
      Background: Plain white background. High quality 3D render, studio lighting.`;

      const response = await this.ai.models.generateContent({
        model: this.imageModelName,
        contents: {
          parts: [{ text: prompt }]
        }
      });

      for (const candidate of response.candidates || []) {
        for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
      }
      return undefined;
    } catch (e) {
      console.error("Avatar generation failed", e);
      return undefined;
    }
  }

  // Generate Speech from Text
  async generateSpeech(text: string, voiceName: string): Promise<AudioBuffer | null> {
    try {
        const response = await this.ai.models.generateContent({
            model: this.ttsModelName,
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voiceName }
                    }
                }
            }
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) return null;

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = await decodeAudioData(
            decodeBase64(base64Audio),
            audioContext,
            24000,
            1
        );
        return audioBuffer;

    } catch (e) {
        console.error("TTS generation failed", e);
        return null;
    }
  }
}

export const geminiService = new GeminiService();