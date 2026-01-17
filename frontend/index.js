// socialconnect/frontend/index.js

// 1. 🛠️ FORCE POLYFILL LOAD FIRST
// This ensures 'crypto.getRandomValues' is ready before ANY app code runs.
import 'react-native-get-random-values';

// 2. 🚀 START THE APP
import 'expo-router/entry';