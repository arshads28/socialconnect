import axios from 'axios';
import { getSecure } from './storage';

// ---------------------------------------------------------------------------
// 1. DEFINE URLS
// ---------------------------------------------------------------------------

// LOCAL (For development on your laptop)
const LOCAL_URL = 'http://10.33.211.238:8000'; 

// PRODUCTION (For the real app store release)
const PROD_URL = 'https://socialconnect-nhna.onrender.com';

// 2. TOGGLE: Change this to 'true' when building the final app
const IS_PRODUCTION = false; 

export const BASE_URL = IS_PRODUCTION ? PROD_URL : LOCAL_URL;

// ---------------------------------------------------------------------------
// 3. AXIOS INSTANCE
// ---------------------------------------------------------------------------
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000, 
});

// The Interceptor: This runs BEFORE every request
api.interceptors.request.use(
  async (config) => {
    const token = await getSecure('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;