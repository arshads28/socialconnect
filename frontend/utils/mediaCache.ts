import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

// ⚠️ Force cast to avoid TS errors
const FS: any = FileSystem;

/* ------------------------------------------------------------------ */
/* CONFIG & HELPERS */
/* ------------------------------------------------------------------ */

const MAX_CACHE_SIZE = 200 * 1024 * 1024; // 200 MB
const MAX_FILE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ✅ FIX: Get directory at runtime to prevent "Storage unavailable" crash on startup
const getCacheDir = () => {
  const base = FS.cacheDirectory || FS.documentDirectory;
  if (!base) throw new Error('Storage unavailable');
  return base + 'connect_cache/'; 
};

const hashString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const ensureDir = async () => {
  const dir = getCacheDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
};

/* ------------------------------------------------------------------ */
/* CACHE CLEANUP */
/* ------------------------------------------------------------------ */

export const cleanupCache = async () => {
  try {
    const dir = getCacheDir();
    const files = await FileSystem.readDirectoryAsync(dir);
    let totalSize = 0;

    const stats = await Promise.all(
      files.map(async (f) => {
        const uri = dir + f;
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) return null;
        totalSize += info.size ?? 0;
        return {
          uri,
          size: info.size ?? 0,
          mtime: info.modificationTime ?? 0,
        };
      })
    );

    const now = Date.now();

    // 1. Remove old files
    for (const f of stats) {
      if (!f) continue;
      if (now - f.mtime * 1000 > MAX_FILE_AGE_MS) {
        await FileSystem.deleteAsync(f.uri, { idempotent: true });
        totalSize -= f.size;
      }
    }

    // 2. LRU Eviction (Remove oldest if over size limit)
    if (totalSize > MAX_CACHE_SIZE) {
      const sorted = stats
        .filter((f): f is { uri: string; size: number; mtime: number } => f !== null)
        .sort((a, b) => a.mtime - b.mtime);

      for (const f of sorted) {
        if (totalSize <= MAX_CACHE_SIZE) break;
        await FileSystem.deleteAsync(f.uri, { idempotent: true });
        totalSize -= f.size;
      }
    }
  } catch (e) {
    // Silent fail is okay for background cleanup
  }
};

/* ------------------------------------------------------------------ */
/* PUBLIC API */
/* ------------------------------------------------------------------ */

// 1. Download & Cache File
export const getCachedFile = async (uri: string): Promise<string> => {
  if (!uri.startsWith('http')) return uri;

  const dir = await ensureDir();
  const ext = uri.split('.').pop()?.split('?')[0] || 'jpg';
  const filename = `${hashString(uri)}.${ext}`;
  const fileUri = dir + filename;

  const info = await FileSystem.getInfoAsync(fileUri);
  if (info.exists) return fileUri;

  // Use Resumable Download (Stable API)
  const downloadResumable = FileSystem.createDownloadResumable(uri, fileUri, {});
  const result = await downloadResumable.downloadAsync();
  
  // Trigger cleanup in background
  cleanupCache().catch(() => {});

  if (!result || !result.uri) throw new Error("Download failed");
  return result.uri;
};

// 2. Save to "Connect" Album
export const saveToGallery = async (localUri: string) => {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') throw new Error('Permission denied');

    // 1. Create Asset
    const asset = await MediaLibrary.createAssetAsync(localUri);

    // 2. Check/Create Album "Connect"
    const albumName = "Connect"; 
    const album = await MediaLibrary.getAlbumAsync(albumName);

    if (album) {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    } else {
      await MediaLibrary.createAlbumAsync(albumName, asset, false);
    }
    
    return true;
  } catch (e) {
    console.error("Save to gallery failed:", e);
    throw e;
  }
};