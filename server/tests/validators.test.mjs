import { describe, it, expect } from 'vitest';
import { validate, signupSchema, loginSchema, companySettingsSchema, aiSettingsSchema } from '../utils/validators.mjs';

describe('Validators', () => {
  describe('signupSchema', () => {
    it('should validate valid signup data', () => {
      const data = {
        email: 'test@example.com',
        password: 'StrongPassword123!',
        name: 'Test User',
        phone: '+4512345678',
      };

      const result = validate(signupSchema, data);
      expect(result.email).toBe(data.email);
      expect(result.name).toBe(data.name);
    });

    it('should reject invalid email', () => {
      const data = {
        email: 'invalid-email',
        password: 'StrongPassword123!',
        name: 'Test User',
      };

      expect(() => validate(signupSchema, data)).toThrow('Validation failed');
    });

    it('should reject short password', () => {
      const data = {
        email: 'test@example.com',
        password: 'short',
        name: 'Test User',
      };

      expect(() => validate(signupSchema, data)).toThrow('Validation failed');
    });

    it('should reject short name', () => {
      const data = {
        email: 'test@example.com',
        password: 'StrongPassword123!',
        name: 'A',
      };

      expect(() => validate(signupSchema, data)).toThrow('Validation failed');
    });
  });

  describe('loginSchema', () => {
    it('should validate valid login data', () => {
      const data = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = validate(loginSchema, data);
      expect(result.email).toBe(data.email);
    });

    it('should reject missing password', () => {
      const data = {
        email: 'test@example.com',
      };

      expect(() => validate(loginSchema, data)).toThrow('Validation failed');
    });
  });

  describe('companySettingsSchema', () => {
    it('should validate valid company settings', () => {
      const data = {
        companyName: 'Test Company',
        website: 'https://example.com',
        industry: 'Technology',
        address: 'Test Street 123',
        city: 'Copenhagen',
        postalCode: '1000',
        country: 'DK',
      };

      const result = validate(companySettingsSchema, data);
      expect(result.companyName).toBe(data.companyName);
    });

    it('should provide defaults for optional fields', () => {
      const data = {
        companyName: 'Test Company',
      };

      const result = validate(companySettingsSchema, data);
      expect(result.country).toBe('DK');
      expect(result.timezone).toBe('Europe/Copenhagen');
    });

    it('should reject invalid URL', () => {
      const data = {
        companyName: 'Test Company',
        website: 'not-a-valid-url',
      };

      expect(() => validate(companySettingsSchema, data)).toThrow('Validation failed');
    });
  });

  describe('aiSettingsSchema', () => {
    it('should validate valid AI settings', () => {
      const data = {
        temperature: 0.7,
        maxTokens: 500,
        responseTone: 'professional',
        language: 'da',
      };

      const result = validate(aiSettingsSchema, data);
      expect(result.temperature).toBe(0.7);
    });

    it('should reject temperature out of range', () => {
      const data = {
        temperature: 3.0,
      };

      expect(() => validate(aiSettingsSchema, data)).toThrow('Validation failed');
    });

    it('should reject invalid tone', () => {
      const data = {
        responseTone: 'invalid-tone',
      };

      expect(() => validate(aiSettingsSchema, data)).toThrow('Validation failed');
    });
  });
});