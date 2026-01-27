// socialconnect/frontend/index.js

// 1. Install Quick Crypto Polyfill (MUST BE FIRST)
import { install } from 'react-native-quick-crypto';
install();

// 2. Crypto-safe randomness (Still good to keep for other libs)
import 'react-native-get-random-values';

// 3. Buffer for Signal (Standard Requirement)
const { Buffer } = require('buffer');
global.Buffer = Buffer;

// 4. Start app
import 'expo-router/entry';
