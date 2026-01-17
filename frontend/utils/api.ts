import axios from 'axios';
import { getSecure, saveSecure, removeSecure } from './storage';
import { router } from 'expo-router';

// ... Environment Variables setup ...
const PROD_URL = 'https://socialconnect-nhna.onrender.com';
const LOCAL_URL = 'http://10.33.211.238:8000';
const IS_PRODUCTION = false;
export const BASE_URL = IS_PRODUCTION ? PROD_URL : LOCAL_URL;

// 1. MEMORY VARIABLE (The fix)
let _currentAccessToken: string | null = null;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// 2. EXPORTED HELPER: Call this immediately after login
export const setClientToken = (token: string | null) => {
  _currentAccessToken = token;
  
  if (token) {
    // Apply to standard Axios defaults
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    // Delete header if logging out
    delete api.defaults.headers.common['Authorization'];
  }
};

// 3. REQUEST INTERCEPTOR (Sync & Fast)
api.interceptors.request.use(
  async (config) => {
    // ⚡ FAST: Use memory variable first
    if (_currentAccessToken) {
      config.headers.Authorization = `Bearer ${_currentAccessToken}`;
    } 
    // Fallback: If memory is empty (e.g. app restart), check disk
    else {
      const token = await getSecure('accessToken');
      if (token) {
        _currentAccessToken = token; // Sync memory
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 4. RESPONSE INTERCEPTOR (Refresh Logic)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        console.log("🔄 Access Token expired. Refreshing...");
        const refreshToken = await getSecure('refreshToken');
        if (!refreshToken) throw new Error("No refresh token");

        const response = await axios.post(`${BASE_URL}/auth/api/token/refresh/`, {
          refresh: refreshToken,
        });

        const newAccessToken = response.data.access;

        //  Update Memory & Disk
        await saveSecure('accessToken', newAccessToken);
        setClientToken(newAccessToken); // Updates _currentAccessToken & Defaults

        // Retry original request
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);

      } catch (refreshError) {
        console.log("❌ Session expired.");
        setClientToken(null); // Clear memory
        await removeSecure('accessToken');
        await removeSecure('refreshToken');
        router.replace('/login');
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;