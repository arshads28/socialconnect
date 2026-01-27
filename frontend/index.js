// socialconnect/frontend/index.js

// 1. Crypto-safe randomness
import 'react-native-get-random-values';

// 2. Buffer for Signal
const { Buffer } = require('buffer');
global.Buffer = Buffer;

// 3. Start app LAST
import 'expo-router/entry';
