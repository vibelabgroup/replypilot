const apiBase = import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");

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
    const response = await fetch(`${apiBase}/api/onboarding/analyze-company`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        companyName,
        website,
      }),
    });

    if (!response.ok) {
      throw new Error(`Company analysis API error: ${response.status}`);
    }

    return await response.json();
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