export interface PaymentDetails {
    name: string;
    email: string;
    cardNumber: string;
    expiry: string;
    cvc: string;
}

export const processPayment = async (details: PaymentDetails): Promise<{ success: boolean; transactionId: string }> => {
    // Simulate network processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Basic mock validation
    if (!details.cardNumber || details.cardNumber.length < 10) {
        throw new Error("Ugyldigt kortnummer");
    }

    return {
        success: true,
        transactionId: "TX_" + Math.random().toString(36).substr(2, 9).toUpperCase()
    };
};