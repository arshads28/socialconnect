// socialconnect/frontend/index.js

import 'react-native-get-random-values';

// Standard Node Polyfill
const { Buffer } = require('buffer');
global.Buffer = Buffer;

// JSC has a working TextEncoder/Decoder, so we don't need fast-text-encoding anymore.

import 'expo-router/entry';