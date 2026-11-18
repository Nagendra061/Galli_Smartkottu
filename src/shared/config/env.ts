export const ENV = {
  APP_NAME_FALLBACK: import.meta.env.VITE_APP_NAME || '',
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
} as const;
