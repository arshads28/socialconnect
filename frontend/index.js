// socialconnect/frontend/index.js

// 1.Random Values (MUST be very first)
import 'react-native-get-random-values';

// 2. Buffer Polyfill
// Use require to ensure it loads synchronously right here
const { Buffer } = require('buffer');
global.Buffer = Buffer;

// 3. TextEncoding Polyfill (The Fix for utf-16le)
const TextEncodingPolyfill = require('text-encoding');

// FORCE OVERWRITE
// Hermes native TextDecoder doesn't support utf-16le. 
// We overwrite it forcefully with the polyfill.
Object.assign(global, {
  TextEncoder: TextEncodingPolyfill.TextEncoder,
  TextDecoder: TextEncodingPolyfill.TextDecoder,
});

try {
  new global.TextDecoder('utf-16le');
  console.log("✅ Polyfill loaded: utf-16le supported");
} catch (e) {
  console.error("❌ Polyfill failed:", e);
}

// 5. Start Router
// This must be LAST so the polyfills are ready before any app code imports them
import 'expo-router/entry';