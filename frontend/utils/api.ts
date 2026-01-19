import axios from 'axios';
import { getSecure, saveSecure, removeSecure } from './storage';
import { DeviceEventEmitter } from 'react-native';

// UPDATE YOUR IP HERE
const PROD_URL = 'https://socialconnect-nhna.onrender.com';
const LOCAL_URL = 'http://10.33.211.238:8000'; // Make sure this matches your PC IP
const IS_PRODUCTION = false;
export const BASE_URL = IS_PRODUCTION ? PROD_URL : LOCAL_URL;

// MEMORY VARIABLES
let _currentAccessToken: string | null = null;
let isRefreshing = false;
let failedQueue: any[] = [];

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000, // Increased timeout for slow networks
  headers: { 'Content-Type': 'application/json' },
});

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

export const setClientToken = (token: string | null) => {
  _currentAccessToken = token;
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

api.interceptors.request.use(
  async (config) => {
    // Prevent 301 Redirects by enforcing trailing slash
    if (config.url && !config.url.endsWith('/') && !config.url.includes('?')) {
        config.url += '/';
    }

    if (_currentAccessToken) {
      config.headers.Authorization = `Bearer ${_currentAccessToken}`;
    } else {
      const token = await getSecure('accessToken');
      if (token) {
        _currentAccessToken = token;
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      
      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers['Authorization'] = 'Bearer ' + token;
          return axios(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await getSecure('refreshToken');

        //  If no token, don't hit backend, just fail request
        if (!refreshToken) {
            isRefreshing = false;
            // We do NOT emit session expired here to avoid loops on splash screen
            return Promise.reject(error); 
        }

        console.log("🔄 Access Token expired. Refreshing...");
        // ✅ URL FIXED: Trailing slash included
        const response = await axios.post(`${BASE_URL}/auth/api/token/refresh/`, {
          refresh: refreshToken,
        });

        const newAccessToken = response.data.access;
        
        await saveSecure('accessToken', newAccessToken);
        setClientToken(newAccessToken); 

        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);
        isRefreshing = false;

        return api(originalRequest);

      } catch (refreshError) {
        processQueue(refreshError, null);
        isRefreshing = false;
        
        // Only force logout if the REFRESH attempt failed (actual session expiry)
        console.log("❌ Refresh failed. Session invalid.");
        DeviceEventEmitter.emit('auth_session_expired');
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;