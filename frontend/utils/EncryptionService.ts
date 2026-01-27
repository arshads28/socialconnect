// socialconnect/frontend/utils/signal/EncryptionService.ts
import { 
  SessionBuilder, 
  SessionCipher, 
} from '@privacyresearch/libsignal-protocol-typescript';
import { signalStore, createAddress } from './SignalManager';
import api from './api'; 
import { Buffer } from 'buffer';

class EncryptionService {
  
  async ensureSession(recipientUsername: string): Promise<void> {
    const address = createAddress(recipientUsername, 1); 

    // : Convert address object to string for DB lookup
    const hasSession = await signalStore.containsSession(address.toString());
    if (hasSession) return;

    console.log(`🔒 No session for ${recipientUsername}. Fetching keys...`);

    try {
      const response = await api.get(`/chat/e2ee/keys/${recipientUsername}/`);
      const bundle = response.data;

      const preKeyBundle = {
        identityKey: Buffer.from(bundle.identityKey, 'base64').buffer,
        registrationId: bundle.registrationId,
        signedPreKey: {
          keyId: bundle.signedPreKey.keyId,
          publicKey: Buffer.from(bundle.signedPreKey.publicKey, 'base64').buffer,
          signature: Buffer.from(bundle.signedPreKey.signature, 'base64').buffer,
        },
        preKey: bundle.preKey ? {
          keyId: bundle.preKey.keyId,
          publicKey: Buffer.from(bundle.preKey.publicKey, 'base64').buffer,
        } : undefined,
      };

      const builder = new SessionBuilder(signalStore as any, address);
      await builder.processPreKey(preKeyBundle);
      console.log(`✅ Session established with ${recipientUsername}`);

    } catch (error) {
      console.error("❌ Failed to establish E2EE session:", error);
    }
  }

  async encrypt(text: string, recipientUsername: string): Promise<string> {
    try {
      await this.ensureSession(recipientUsername);

      const address = createAddress(recipientUsername, 1);
      const cipher = new SessionCipher(signalStore as any, address);

      const plaintext = Buffer.from(text, 'utf-8');
      
      const ciphertextBody = await cipher.encrypt(plaintext as any);

      return JSON.stringify({
        type: ciphertextBody.type,
        body: ciphertextBody.body, 
        registrationId: ciphertextBody.registrationId
      });

    } catch (e) {
      console.error("Encryption Failed:", e);
      throw new Error("E2EE Encryption Failed");
    }
  }


  async decrypt(encryptedJson: string, senderUsername: string): Promise<string> {
    try {
      if (!encryptedJson.startsWith('{')) return encryptedJson; 

      const address = createAddress(senderUsername, 1);
      const cipher = new SessionCipher(signalStore as any, address);

      const message = JSON.parse(encryptedJson);
      
      let plaintextBuffer: ArrayBuffer;

      if (message.type === 3) {
        plaintextBuffer = await cipher.decryptPreKeyWhisperMessage(message.body, 'binary');
      } else {
        plaintextBuffer = await cipher.decryptWhisperMessage(message.body, 'binary');
      }

      return Buffer.from(plaintextBuffer).toString('utf-8');

    } catch (e) {
      console.error("Decryption Failed:", e);
      return "⚠️ Decryption Error";
    }
  }
}

export default new EncryptionService();