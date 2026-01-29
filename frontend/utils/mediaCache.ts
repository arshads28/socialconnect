import { Alert, Linking, Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

// FIX: Use 'legacy' import to bypass SDK 54 Deprecation Errors
import * as FileSystem from 'expo-file-system/legacy';

const MAX_CACHE_SIZE = 200 * 1024 * 1024; // 200 MB
const MAX_FILE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

//  HELPER: Robust Directory Logic
const getCacheDir = () => {
  const FS = FileSystem as any; 
  let base = FS.cacheDirectory || FS.documentDirectory;

  //  FALLBACK: Construct External Path manually if Constants are Null
  if (!base && Platform.OS === 'android') {
    // This points to: Android/data/com.connect.app/files/connect_cache/
    base = 'file:///storage/emulated/0/Android/data/com.connect.app/files/';
  }

  if (!base) return null;
  
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
  if (!dir) return null;

  try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
  } catch (e) {
      console.warn("Error creating cache dir:", e);
  }
  return dir;
};

// Cleanup Logic
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
      
      if (!dir) {
          console.log("FileSystem unavailable: Using remote URI.");
          return uri;
      }
      
      const safeUri = encodeURI(uri);
      const urlWithoutQuery = safeUri.split('?')[0];
      const ext = urlWithoutQuery.split('.').pop()?.substring(0, 4) || 'jpg';
      const filename = `${hashString(urlWithoutQuery)}.${ext}`;
      const fileUri = dir + filename;

      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) return fileUri;

      const downloadResumable = FileSystem.createDownloadResumable(safeUri, fileUri, {});
      const result = await downloadResumable.downloadAsync();
      
      return result?.uri || uri;

  } catch (e) {
      console.warn("Cache Failed, using remote URI:", e);
      return uri; 
  }
};

export const saveToGallery = async (uri: string) => {
  let finalUri = uri;
  let isTemporary = false;

  try {
    // 1. Permission Check
    const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
         if (!canAskAgain) {
            Alert.alert(
                "Permission Required",
                "Storage permission was denied.\nPlease go to Settings > Apps > Connect > Permissions and allow access.",
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Open Settings", onPress: () => Linking.openSettings() }
                ]
            );
            return false;
        }
        throw new Error('Permission denied');
    }

    // 2. Handle Remote URLs (Download required for Android)
    if (finalUri.startsWith('http') || finalUri.startsWith('https')) {
        const FS = FileSystem as any;
        
        //  MANUAL FALLBACK if constants are null
        let dir = FS.documentDirectory || FS.cacheDirectory;
        if (!dir && Platform.OS === 'android') {
             // Use External Storage path
             dir = 'file:///storage/emulated/0/Android/data/com.connect.app/files/';
        }

        if (!dir) throw new Error("FileSystem unavailable");

        try {
            await FS.makeDirectoryAsync(dir, { intermediates: true });
        } catch(e) { /* ignore if exists */ }

        const ext = finalUri.split('.').pop()?.substring(0, 4) || 'jpg';
        const tempUri = dir + `temp_${Date.now()}.${ext}`;
        
        console.log(" Downloading to:", tempUri);
        
        //  The Legacy Import fixes the "Deprecated" crash here
        const result = await FS.downloadAsync(finalUri, tempUri);
        finalUri = result.uri;
        isTemporary = true; 
    }

    // 3. Save to Gallery
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
    throw e;
  } finally {
    if (isTemporary && finalUri) {
        try {
            await FileSystem.deleteAsync(finalUri, { idempotent: true });
        } catch (cleanupError) {
            // ignore
        }
    }
  }
};

export const saveBatchToGallery = async (uris: string[]) => {
  const tempFiles: string[] = [];

  try {
    // 1. Permission Check (Once)
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') throw new Error('Permission denied');

    // 2. Setup Directory (ONCE, not inside loop)
    const FS = FileSystem as any;
    let dir = FS.documentDirectory || FS.cacheDirectory;
    
    if (!dir && Platform.OS === 'android') {
        dir = 'file:///storage/emulated/0/Android/data/com.connect.app/files/';
    }
    try { await FS.makeDirectoryAsync(dir, { intermediates: true }); } catch(e) {}

    // 3. Process ALL files concurrently (Parallel Speed Boost )
    const assetPromises = uris.map(async (uri) => {
        try {
            let finalUri = uri;

            if (finalUri.startsWith('http') || finalUri.startsWith('https')) {
                const ext = finalUri.split('.').pop()?.substring(0, 4) || 'jpg';
                // Unique name to prevent collision
                const tempUri = dir + `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
                
                const result = await FS.downloadAsync(finalUri, tempUri);
                finalUri = result.uri;
                tempFiles.push(finalUri); // Mark for cleanup
            }

            // Create Asset
            return await MediaLibrary.createAssetAsync(finalUri);

        } catch (e) {
            console.error("Failed one file:", uri, e);
            return null;
        }
    });

    // Wait for ALL downloads to finish
    const results = await Promise.all(assetPromises);
    const assets = results.filter((a): a is MediaLibrary.Asset => a !== null);

    if (assets.length === 0) return 0;

    // 4. Batch Save to Album
    const albumName = "Connect";
    const album = await MediaLibrary.getAlbumAsync(albumName);

    if (album) {
        await MediaLibrary.addAssetsToAlbumAsync(assets, album, false);
    } else {
        await MediaLibrary.createAlbumAsync(albumName, assets[0], false);
        if (assets.length > 1) {
             await MediaLibrary.addAssetsToAlbumAsync(assets.slice(1), album, false);
        }
    }

    return assets.length;

  } catch (e: any) {
    console.error("Batch save failed:", e);
    throw e;
  } finally {
    // 5. Cleanup (Runs in background)
    // We don't await this so the UI returns immediately
    Promise.all(tempFiles.map(file => 
        FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {})
    ));
  }
};