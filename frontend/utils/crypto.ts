import CryptoJS from 'crypto-js';

// We rely on 'react-native-get-random-values' imported in _layout.tsx
// No manual polyfills needed here anymore.

const SECRET_KEY = "super_secret_postman_key"; 

export const encryptMessage = (text: string) => {
  try {
    return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
  } catch (error) {
    console.error("Encryption Error:", error);
    return text; 
  }
};

export const decryptMessage = (ciphertext: string) => {
  if (!ciphertext) return "";
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted || ciphertext; 
  } catch (e) {
    console.log("Decryption failed:", e);
    return ciphertext; 
  }
};