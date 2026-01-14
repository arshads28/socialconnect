import axios from 'axios';
import { getSecure } from './storage';
import { Platform } from 'react-native';

// ⚠️ CHANGE THIS to your correct URL
const BASE_URL = Platform.OS === 'android' 
  ? 'http://10.0.2.2:8000' 
  : 'http://localhost:8000'; // or your Render URL

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// The Interceptor: This runs BEFORE every request
api.interceptors.request.use(
  async (config) => {
    const token = await getSecure('accessToken');
    console.log("Interceptor sending token:", token);
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