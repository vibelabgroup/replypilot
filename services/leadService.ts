export interface LeadData {
    name: string;
    email: string;
    phone: string;
}

export const submitLead = async (data: LeadData): Promise<{ success: boolean; message: string }> => {
    // Simulate network latency (0.8 - 1.5 seconds)
    const delay = Math.random() * 700 + 800;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Simulate basic validation
    if (!data.email.includes('@') || data.phone.length < 8) {
        throw new Error("Ugyldige kontaktinformationer");
    }

    // In a real application, this would be a POST request to your API
    console.log("Creating new lead record in database:", data);

    return {
        success: true,
        message: "Tak! Vi kontakter dig hurtigst muligt."
    };
};