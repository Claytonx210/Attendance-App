
import { GoogleGenAI } from "@google/genai";
import { StudentRecord } from "../types";

export const analyzeLateArrivals = async (records: StudentRecord[]): Promise<string> => {
  // Directly initialize GoogleGenAI assuming process.env.API_KEY is pre-configured.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Summarize the data for the prompt
  const dataSummary = records.map(r => `${r.name} (Class ${r.class}) at ${r.arrivalTime}`).join(', ');
  
  const prompt = `
    Analyze the following list of student late arrivals at a school gate today (Threshold: 08:30 AM):
    ${dataSummary}

    Provide a very brief 2-3 sentence summary:
    1. Are there specific classes that are more frequent?
    2. Is there a peak time for arrivals?
    3. Any encouraging suggestion for the school staff to manage the 2000 student body.
    Keep it professional and helpful.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 0.9,
      }
    });

    // Directly access the .text property from the GenerateContentResponse object.
    return response.text || "No specific trends identified yet.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Unable to generate insights at this moment.";
  }
};
