export interface Review {
    text: string;
    author: string;
    role: string;
    stars: number;
}

export interface ChatMessage {
    id: string;
    type: 'event' | 'system' | 'user';
    text: string;
    delay: number;
}

export interface Feature {
    icon: 'Bot' | 'Zap' | 'Clock' | 'BellRing' | 'CalendarCheck2' | 'SmartphoneNfc';
    title: string;
    description: string;
}

export interface CalculationResult {
    revenue: number;
    calls: number;
    value: number;
}

export interface OnboardingData {
    companyName: string;
    website: string;
    industry: string;
    description: string; // The "Brain" of the AI
    // Enhanced Corporate Data
    cvr?: string;
    foundingYear?: string;
    address?: string;
    serviceArea?: string;
    servicesList?: string[];
    openingHours?: string;
    // Assistant Config
    assistantName: string;
    tone: 'professional' | 'casual' | 'friendly';
    notifications: {
        sms: boolean;
        email: boolean;
        phoneNumber: string;
        emailAddress: string;
    };
}