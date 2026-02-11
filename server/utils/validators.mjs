import { z } from 'zod';

// Auth schemas
export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(/^\+?[\d\s-]{8,}$/, 'Invalid phone number').optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const passwordResetSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// Customer settings schemas
export const companySettingsSchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(255),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  industry: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().length(2, 'Country code must be 2 characters').default('DK'),
  businessHours: z.object({
    monday: z.object({ open: z.string(), close: z.string() }),
    tuesday: z.object({ open: z.string(), close: z.string() }),
    wednesday: z.object({ open: z.string(), close: z.string() }),
    thursday: z.object({ open: z.string(), close: z.string() }),
    friday: z.object({ open: z.string(), close: z.string() }),
    saturday: z.object({ open: z.string(), close: z.string() }),
    sunday: z.object({ open: z.string(), close: z.string() }),
  }).optional(),
  timezone: z.string().default('Europe/Copenhagen'),
});

export const aiSettingsSchema = z.object({
  systemPrompt: z.string().max(4000).optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(50).max(2000).default(500),
  responseTone: z.enum(['professional', 'friendly', 'casual', 'formal']).default('professional'),
  language: z.string().length(2).default('da'),
  enableGreetings: z.boolean().default(true),
  greetingTemplate: z.string().max(500).optional(),
  enableClosings: z.boolean().default(true),
  closingTemplate: z.string().max(500).optional(),
  autoResponseEnabled: z.boolean().default(true),
  autoResponseDelaySeconds: z.number().min(0).max(3600).default(30),
  workingHoursOnly: z.boolean().default(false),
  fallbackMessage: z.string().max(500).optional(),
});

export const notificationPreferencesSchema = z.object({
  emailEnabled: z.boolean().default(true),
  emailNewLead: z.boolean().default(true),
  emailNewMessage: z.boolean().default(false),
  emailDailyDigest: z.boolean().default(true),
  emailWeeklyReport: z.boolean().default(true),
  smsEnabled: z.boolean().default(false),
  smsPhone: z.string().regex(/^\+?[\d\s-]{8,}$/, 'Invalid phone number').optional().or(z.literal('')),
  smsNewLead: z.boolean().default(true),
  smsNewMessage: z.boolean().default(false),
  digestType: z.enum(['hourly', 'daily', 'weekly']).default('daily'),
  digestTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format').default('09:00'),
});

// Stripe checkout schema
export const checkoutSessionSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().min(8, 'Phone is required'),
  priceId: z.string().min(1, 'Price ID is required'),
});

// SMS webhook schema
export const incomingSmsSchema = z.object({
  From: z.string().min(1, 'From is required'),
  To: z.string().min(1, 'To is required'),
  Body: z.string().optional().default(''),
  MessageSid: z.string().optional(),
  FromCity: z.string().optional(),
  FromState: z.string().optional(),
  FromZip: z.string().optional(),
  FromCountry: z.string().optional(),
});

// Conversation schemas
export const createConversationSchema = z.object({
  leadName: z.string().max(255).optional(),
  leadPhone: z.string().regex(/^\+?[\d\s-]{8,}$/, 'Invalid phone number'),
  leadEmail: z.string().email('Invalid email').optional().or(z.literal('')),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message is required').max(1600, 'Message too long'),
  conversationId: z.string().uuid('Invalid conversation ID'),
});

// Lead schemas
export const createLeadSchema = z.object({
  name: z.string().max(255).optional(),
  phone: z.string().regex(/^\+?[\d\s-]{8,}$/, 'Invalid phone number'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  source: z.enum(['sms', 'call', 'email', 'website', 'referral']).default('sms'),
  notes: z.string().optional(),
  estimatedValue: z.number().min(0).optional(),
});

export const updateLeadSchema = z.object({
  name: z.string().max(255).optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  qualification: z.enum(['hot', 'warm', 'cold', 'unqualified']).optional(),
  notes: z.string().optional(),
  estimatedValue: z.number().min(0).optional(),
  tags: z.array(z.string()).optional(),
});

// Validation helper
export const validate = (schema, data) => {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    }));
    
    const error = new Error('Validation failed');
    error.statusCode = 400;
    error.errors = errors;
    throw error;
  }
  
  return result.data;
};