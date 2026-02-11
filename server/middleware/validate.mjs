import { validate as validateSchema } from '../utils/validators.mjs';
import { createValidationError } from './errorHandler.mjs';

// Request validation middleware factory
export const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const data = req[source];
      const validated = validateSchema(schema, data);
      
      // Replace request data with validated data
      req[source] = validated;
      
      // Also store in req.validated for later access
      if (!req.validated) req.validated = {};
      req.validated[source] = validated;
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Validate body
export const validateBody = (schema) => validate(schema, 'body');

// Validate query params
export const validateQuery = (schema) => validate(schema, 'query');

// Validate params
export const validateParams = (schema) => validate(schema, 'params');

// Sanitize middleware - basic XSS prevention
export const sanitize = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  };

  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };

  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  
  next();
};