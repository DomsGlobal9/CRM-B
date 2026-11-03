/**
 * Where the backend is. VITE_API_URL is set per environment (.env files, the
 * host's build settings); without it the app talks to a local Django on 8000.
 */
export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
