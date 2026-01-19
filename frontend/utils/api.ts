import axios from 'axios';
import { getSecure, saveSecure, removeSecure } from './storage';
import { router } from 'expo-router';
import { DeviceEventEmitter } from 'react-native';

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

    // If 401 (Unauthorized) and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      console.log("🔄 Access Token expired. Refreshing...");

      try {
        const refreshToken = await getSecure('refreshToken');

        // 🔴 CRITICAL FIX: If no refresh token, FORCE LOGOUT
        if (!refreshToken) {
          console.log("❌ No refresh token found. Force Logout.");
          DeviceEventEmitter.emit('auth_session_expired'); 
          return Promise.reject(new Error("No refresh token"));
        }

        const response = await axios.post(`${BASE_URL}auth/api/token/refresh/`, {
          refresh: refreshToken,
        });

        const newAccessToken = response.data.access;
        await saveSecure('accessToken', newAccessToken);

        console.log("✅ Token Refreshed!");
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);

      } catch (refreshError) {
        console.log("❌ Session expired completely.");
        // 🔴 CRITICAL FIX: If refresh API fails, FORCE LOGOUT
        DeviceEventEmitter.emit('auth_session_expired');
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;