import { GoogleGenAI, Type } from "@google/genai";

const apiBase = import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");
const apiKey = import.meta.env.VITE_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
const demoModel = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.5-flash";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const initChatSession = () => {
  // Session state is handled server-side for demo AI requests.
  return null;
};

export const generateAIResponse = async (
  userMessage: string,
  history: Array<{ role: "user" | "model"; text: string }> = []
): Promise<string> => {
  try {
    const response = await fetch(`${apiBase}/api/demo/ai-response`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: userMessage,
        history,
      }),
    });

    if (!response.ok) {
      throw new Error(`Demo AI API error: ${response.status}`);
    }
    const payload = await response.json();
    return payload?.response || "Beklager, jeg fangede ikke det hele. Kan du gentage?";
  } catch (error) {
    console.error("AI Service Error:", error);
    return "Systemfejl: Kunne ikke forbinde til Replypilot serveren. Prøv igen senere.";
  }
};

// New function to analyze company info with deep structured extraction
export const analyzeCompanyInfo = async (companyName: string, website: string) => {
    try {
        const prompt = `
        Perform a strict, deep-dive corporate analysis of "${companyName}" (Website: ${website}).

        **PHASE 1: HARD FACTS VERIFICATION (REGISTRY DATA)**
        You MUST use the Google Search tool to find official registry data.
        Search Queries to execute:
        1. "${companyName} CVR nummer proff.dk"
        2. "${companyName} CVRAPI"
        3. "site:${website} CVR"

        From these results, you MUST extract:
        - **CVR Number**: The 8-digit Danish business registration number.
        - **Founding Year**: Look for "Startdato", "Etableringsår", "Stiftet", or "Grundlagt" in the Proff/CVRAPI snippet. This is MANDATORY.
        - **Address**: The official HQ address.

        **PHASE 2: SERVICE & OPERATIONS DEEP SCAN**
        Search Queries to execute:
        1. "site:${website} ydelser" OR "site:${website} services"
        2. "site:${website} opgaver" OR "site:${website} vi tilbyder"
        3. "${companyName} åbningstider"

        From these results, extract:
        - **Services**: A COMPLETE and EXHAUSTIVE list of specific services. Do not summarize. List every single service mentioned in menus, dropdowns, or lists. Aim for 30+ items if the site is comprehensive.
        - **Service Area**: Geographical coverage (e.g., "Hele Danmark", "Storkøbenhavn", "Jylland").
        - **Opening Hours**: e.g., "Man-Fre 07-16".

        **PHASE 3: PROFILE GENERATION**
        Write a professional, trustworthy "Om Os" text (Danish) for the AI receptionist.
        - **Founding Year Integration**: You MUST mention the founding year (e.g., "Siden [Year] har vi...").
        - **Coverage**: Mention the specific area.
        - **Tone**: Experienced and quality-focused.

        Return valid JSON only.
        `;

        const response = await ai.models.generateContent({
            model: demoModel,
            contents: prompt,
            config: {
                tools: [{googleSearch: {}}],
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        officialName: { type: Type.STRING },
                        cvr: { type: Type.STRING, description: "8 digit number" },
                        foundingYear: { type: Type.STRING, description: "Year of establishment (e.g. 2015)" },
                        address: { type: Type.STRING },
                        serviceArea: { type: Type.STRING, description: "Geographical coverage area" },
                        openingHours: { type: Type.STRING },
                        services: { 
                            type: Type.ARRAY, 
                            items: { type: Type.STRING },
                            description: "List of specific services offered. Be exhaustive (30+ items if available)."
                        },
                        description: { type: Type.STRING },
                        industry: { type: Type.STRING }
                    }
                }
            }
        });

        const jsonStr = response.text || '{}';
        // Handle potential markdown code blocks if the model adds them despite MIME type
        const cleanJson = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(cleanJson);
        
        // Ensure description exists even if model returns null
        if (!result.description || result.description.length < 10) {
            const yearText = result.foundingYear ? `Siden ${result.foundingYear} har vi` : "Vi har";
            result.description = `${yearText} leveret kvalitetsarbejde som ${result.officialName || companyName}. Vi dækker ${result.serviceArea || "hele området"} og sætter en ære i godt håndværk.`;
        }
        
        return result;

    } catch (error) {
        console.error("Analysis failed", error);
        // Fallback data
        return {
            officialName: companyName,
            cvr: "",
            foundingYear: "",
            address: "Danmark",
            serviceArea: "Regionalt",
            openingHours: "Man-Fre: 08:00 - 16:00",
            services: ["Rådgivning", "Service", "Renovering"],
            description: "Vi er en professionel virksomhed der sætter en ære i godt håndværk og god kundeservice.",
            industry: "other"
        };
    }
};