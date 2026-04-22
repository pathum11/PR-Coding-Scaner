import { GoogleGenAI } from "@google/genai";

/**
 * Gemini AI Service
 * 
 * Note: In this environment, the Gemini API is configured to be called from the frontend.
 * The API key is automatically injected by the platform into process.env.GEMINI_API_KEY.
 */
export const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY as string 
});

/**
 * Basic text generation helper
 */
export async function generateText(prompt: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}
