// socialconnect/frontend/utils/SignalManager.ts
import { 
  KeyHelper, 
  KeyPairType,
  SignalProtocolAddress
} from '@privacyresearch/libsignal-protocol-typescript';
import * as SecureStore from 'expo-secure-store';
import { getAdapter } from './db';
import { Buffer } from 'buffer'; 

const REGISTRATION_ID_KEY = 'signal_registration_id';
const IDENTITY_KEY_PAIR_KEY = 'signal_identity_key_pair';

class SignalStoreAdapter {
  
  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    const json = await SecureStore.getItemAsync(IDENTITY_KEY_PAIR_KEY);
    if (!json) return undefined;
    const parsed = JSON.parse(json);
    return {
        pubKey: Buffer.from(parsed.pubKey, 'base64').buffer,
        privKey: Buffer.from(parsed.privKey, 'base64').buffer
    } as any;
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    const id = await SecureStore.getItemAsync(REGISTRATION_ID_KEY);
    return id ? parseInt(id, 10) : undefined;
  }

  async saveIdentity(identifier: string, identityKey: ArrayBuffer): Promise<boolean> {
     const keyString = Buffer.from(identityKey).toString('base64');
     getAdapter().getRawDB()?.runSync(
       `INSERT OR REPLACE INTO signal_identities (address, key) VALUES (?, ?)`,
       [identifier, keyString]
     );
     return true; 
  }
  
  async isTrustedIdentity(identifier: string, identityKey: ArrayBuffer, direction: any): Promise<boolean> {
      const existing = await this.loadIdentityKey(identifier);
      
      // We have never chatted with this user. Trust them (First Use).
      if (!existing) {
          return true;
      }

      // We know them. Compare the new key with the saved key.
      const buffer1 = Buffer.from(existing);
      const buffer2 = Buffer.from(identityKey);
      
      const isMatch = buffer1.equals(buffer2);

      if (!isMatch) {
          console.warn(`🚨 SECURITY WARNING: Identity key for ${identifier} has changed! Potential intercept detected.`);
          // In a real app, you would show a UI prompt: "Security Code Changed. Accept?"
          // For now, we BLOCK it to be safe.
          return false; 
      }

      return true;
  }
  
  async loadIdentityKey(identifier: string): Promise<ArrayBuffer | undefined> {
      const res: any = getAdapter().getRawDB()?.getFirstSync(
        `SELECT key FROM signal_identities WHERE address = ?`, 
        [identifier]
      );
      if (!res) return undefined;
      return Buffer.from(res.key, 'base64').buffer as ArrayBuffer;
  }

  async storeSession(identifier: string, record: string): Promise<void> {
    getAdapter().getRawDB()?.runSync(
      `INSERT OR REPLACE INTO signal_sessions (id, record) VALUES (?, ?)`,
      [identifier, record]
    );
  }

  async loadSession(identifier: string): Promise<string | undefined> {
    const res: any = getAdapter().getRawDB()?.getFirstSync(
      `SELECT record FROM signal_sessions WHERE id = ?`,
      [identifier]
    );
    return res ? res.record : undefined;
  }

  async containsSession(identifier: string): Promise<boolean> {
    const res: any = getAdapter().getRawDB()?.getFirstSync(
      `SELECT 1 FROM signal_sessions WHERE id = ?`,
      [identifier]
    );
    return !!res;
  }
  async storePreKey(keyId: number, keyPair: KeyPairType): Promise<void> {
    const storageObj = {
        pubKey: Buffer.from(keyPair.pubKey).toString('base64'),
        privKey: Buffer.from(keyPair.privKey).toString('base64')
    };
    getAdapter().getRawDB()?.runSync(
      `INSERT OR REPLACE INTO signal_prekeys (key_id, record) VALUES (?, ?)`,
      [keyId, JSON.stringify(storageObj)]
    );
  }

  async loadPreKey(keyId: number): Promise<KeyPairType | undefined> {
    const res: any = getAdapter().getRawDB()?.getFirstSync(
      `SELECT record FROM signal_prekeys WHERE key_id = ?`,
      [keyId]
    );
    if (!res) return undefined;
    const parsed = JSON.parse(res.record);
    return {
        pubKey: Buffer.from(parsed.pubKey, 'base64').buffer,
        privKey: Buffer.from(parsed.privKey, 'base64').buffer
    } as any;
  }
  
  async removePreKey(keyId: number): Promise<void> {
     getAdapter().getRawDB()?.runSync(`DELETE FROM signal_prekeys WHERE key_id = ?`, [keyId]);
  }

  async storeSignedPreKey(keyId: number, keyPair: KeyPairType): Promise<void> {
    const storageObj = {
        pubKey: Buffer.from(keyPair.pubKey).toString('base64'),
        privKey: Buffer.from(keyPair.privKey).toString('base64')
    };
    getAdapter().getRawDB()?.runSync(
      `INSERT OR REPLACE INTO signal_signed_prekeys (key_id, record) VALUES (?, ?)`,
      [keyId, JSON.stringify(storageObj)]
    );
  }

  async loadSignedPreKey(keyId: number): Promise<KeyPairType | undefined> {
    const res: any = getAdapter().getRawDB()?.getFirstSync(
      `SELECT record FROM signal_signed_prekeys WHERE key_id = ?`,
      [keyId]
    );
    if (!res) return undefined;
    const parsed = JSON.parse(res.record);
    return {
        pubKey: Buffer.from(parsed.pubKey, 'base64').buffer,
        privKey: Buffer.from(parsed.privKey, 'base64').buffer
    } as any;
  }

  async removeSignedPreKey(keyId: number): Promise<void> {
    getAdapter().getRawDB()?.runSync(`DELETE FROM signal_signed_prekeys WHERE key_id = ?`, [keyId]);
  }
}

export const signalStore = new SignalStoreAdapter();

export const generateIdentity = async () => {
  const existingId = await SecureStore.getItemAsync(REGISTRATION_ID_KEY);
  if (existingId) {
    console.log("🔐 E2EE Identity already exists.");
    return null;
  }

  console.log("⚙️ Generating new E2EE Identity...");

  const registrationId = KeyHelper.generateRegistrationId();
  const identityKeyPair = await KeyHelper.generateIdentityKeyPair();

  // Store Identity
  const identityStorage = {
      pubKey: Buffer.from(identityKeyPair.pubKey).toString('base64'),
      privKey: Buffer.from(identityKeyPair.privKey).toString('base64')
  };

  await SecureStore.setItemAsync(REGISTRATION_ID_KEY, registrationId.toString());
  await SecureStore.setItemAsync(IDENTITY_KEY_PAIR_KEY, JSON.stringify(identityStorage));

  // Signed PreKey
  const signedPreKeyId = 1;
  const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);
  await signalStore.storeSignedPreKey(signedPreKeyId, signedPreKey.keyPair);

  // One-Time PreKeys
  const publicPreKeys: any[] = [];
  const startId = 0;
  const count = 100;

  for (let i = 0; i < count; i++) {
      const preKeyId = startId + i;
      const preKey = await KeyHelper.generatePreKey(preKeyId);
      await signalStore.storePreKey(preKeyId, preKey.keyPair);
      
      publicPreKeys.push({
          keyId: preKeyId,
          publicKey: Buffer.from(preKey.keyPair.pubKey).toString('base64')
      });
  }

  const publicBundle = {
    registrationId,
    identityKey: Buffer.from(identityKeyPair.pubKey).toString('base64'),
    signedPreKey: {
      keyId: signedPreKeyId,
      publicKey: Buffer.from(signedPreKey.keyPair.pubKey).toString('base64'),
      signature: Buffer.from(signedPreKey.signature).toString('base64')
    },
    preKeys: publicPreKeys
  };

  return publicBundle;
};

export const createAddress = (username: string, deviceId: number = 1) => {
  return new SignalProtocolAddress(username, deviceId);
};