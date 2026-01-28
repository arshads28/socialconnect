import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

// Constants
const MAX_CACHE_SIZE = 200 * 1024 * 1024; // 200 MB
const MAX_FILE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

//  HELPER: Robust Directory Logic
// Fixes "Storage unavailable" crashes by checking permissions safely
const getCacheDir = () => {
  const FS = FileSystem as any; 
  const base = FS.cacheDirectory || FS.documentDirectory;

  if (!base) return null; // Return null if native module is missing (Old Build)
  
  return base.endsWith('/') ? base + 'connect_cache/' : base + '/connect_cache/';
};

const hashString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

// Ensure Directory Exists
const ensureDir = async () => {
  const dir = getCacheDir();
  if (!dir) throw new Error("FileSystem unavailable. Please rebuild your app: npx expo run:android");

  try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
  } catch (e) {
      // Silent fail
  }
  return dir;
};

// Cleanup Logic (Runs in background)
export const cleanupCache = async () => {
  try {
    const dir = getCacheDir();
    if (!dir) return;

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
  if (!uri || !uri.startsWith('http')) return uri || "";

  try {
      const dir = await ensureDir();
      
      const safeUri = encodeURI(uri);
      const urlWithoutQuery = safeUri.split('?')[0];
      const ext = urlWithoutQuery.split('.').pop()?.substring(0, 4) || 'jpg';
      const filename = `${hashString(urlWithoutQuery)}.${ext}`;
      const fileUri = dir + filename;

      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) return fileUri;

      const downloadResumable = FileSystem.createDownloadResumable(safeUri, fileUri, {});
      const result = await downloadResumable.downloadAsync();
      
      cleanupCache().catch(() => {});

      if (!result || !result.uri) throw new Error("Download returned no URI");
      return result.uri;

  } catch (e) {
      console.warn("Cache Failed, using remote URI:", e);
      return uri; 
  }
};

//  Robust Gallery Saver (Handles Remote URLs)
export const saveToGallery = async (uri: string) => {
  let finalUri = uri;
  let isTemporary = false;

  try {
    // 1. Permission Check
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') throw new Error('Permission denied. Go to settings.');

    // 2. Download Remote URL to Temp File (Required for Android)
    if (finalUri.startsWith('http') || finalUri.startsWith('https')) {
        const FS = FileSystem as any;
        if (!FS.documentDirectory) throw new Error("FileSystem missing. Rebuild App.");

        const ext = finalUri.split('.').pop()?.substring(0, 4) || 'jpg';
        // Create a temporary path
        const tempUri = FS.documentDirectory + `temp_${Date.now()}.${ext}`;
        
        console.log("📥 Downloading to temp storage...");
        const result = await FS.downloadAsync(finalUri, tempUri);
        finalUri = result.uri;
        isTemporary = true; 
    }

    // 3. Save to Gallery (This copies the file to the OS Media Store)
    const asset = await MediaLibrary.createAssetAsync(finalUri);
    
    // 4. Organize into "Connect" Album
    const albumName = "Connect"; 
    const album = await MediaLibrary.getAlbumAsync(albumName);

    if (album) {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    } else {
      await MediaLibrary.createAlbumAsync(albumName, asset, false);
    }
    return true;

  } catch (e: any) {
    console.error("Save failed:", e);
    throw new Error(e.message || "Could not save to gallery");
  } finally {
    if (isTemporary) {
        try {
            await FileSystem.deleteAsync(finalUri, { idempotent: true });
            console.log("🧹 Temp file cleaned up");
        } catch (cleanupError) {
            console.warn("Failed to delete temp file:", cleanupError);
        }
    }
  }
};