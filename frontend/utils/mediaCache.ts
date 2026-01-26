import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

// Expo typings workaround
const FS: any = FileSystem;

const MAX_CACHE_SIZE = 200 * 1024 * 1024; // 200 MB
const MAX_FILE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// FIX: Runtime directory generation (prevents "Storage unavailable" crash)
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
        return { uri, size: info.size ?? 0, mtime: info.modificationTime ?? 0 };
      })
    );

    const now = Date.now();
    for (const f of stats) {
      if (!f) continue;
      if (now - f.mtime * 1000 > MAX_FILE_AGE_MS) {
        await FileSystem.deleteAsync(f.uri, { idempotent: true });
        totalSize -= f.size;
      }
    }

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
    // Silent fail
  }
};

/* ------------------------------------------------------------------ */
/* PUBLIC API */
/* ------------------------------------------------------------------ */

export const getCachedFile = async (uri: string): Promise<string> => {
  if (!uri.startsWith('http')) return uri;

  const dir = await ensureDir();
  
  // FIX 1: Encode URI (Fixes "Failed to download" if spaces exist)
  const safeUri = encodeURI(uri);

  // FIX 2: CDN Token Support (Handle urls like image.jpg?token=123)
  // We strip query params ONLY for generating the extension/filename,
  // but we use the FULL URL for downloading.
  const urlWithoutQuery = safeUri.split('?')[0];
  const ext = urlWithoutQuery.split('.').pop()?.substring(0, 4) || 'jpg';
  
  // Create deterministic filename based on full URL (so tokens don't cause redownload if url is same)
  const filename = `${hashString(urlWithoutQuery)}.${ext}`;
  const fileUri = dir + filename;

  const info = await FileSystem.getInfoAsync(fileUri);
  if (info.exists) return fileUri;

  // Use Resumable Download (Stable API)
  const downloadResumable = FileSystem.createDownloadResumable(safeUri, fileUri, {});
  const result = await downloadResumable.downloadAsync();
  
  cleanupCache().catch(() => {});

  if (!result || !result.uri) throw new Error("Download failed");
  return result.uri;
};

export const saveToGallery = async (localUri: string) => {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') throw new Error('Permission denied');

    const asset = await MediaLibrary.createAssetAsync(localUri);
    const albumName = "Connect"; // ✅ Album Name
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