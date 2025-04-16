export const ERROR_MESSAGES = {
  AUTH: {
    NOT_AUTHENTICATED: 'User not authenticated',
    ACCESS_DENIED: 'Access denied',
    INVALID_CREDENTIALS: 'Invalid credentials',
    TOKEN_EXPIRED: 'Token has expired',
    INVALID_TOKEN: 'Invalid token',
  },
  USER: {
    NOT_FOUND: 'User not found',
    ALREADY_EXISTS: 'User already exists',
    INVALID_ROLE: 'Invalid user role',
  },
  VALIDATION: {
    INVALID_INPUT: 'Invalid input data',
    REQUIRED_FIELD: 'This field is required',
  },
  DATABASE: {
    CONNECTION_ERROR: 'Database connection error',
    QUERY_ERROR: 'Database query error',
  },
  GENERAL: {
    INTERNAL_ERROR: 'Internal server error',
    NOT_FOUND: 'Resource not found',
    FORBIDDEN: 'Access forbidden',
  },
} as const
