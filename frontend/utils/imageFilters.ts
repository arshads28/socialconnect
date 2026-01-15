import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

export async function applyFilter(
  uri: string,
  filter: 'none' | 'natural' | 'vivid' | 'warm'
): Promise<string> {
  try {
    // Optimize size first
    const resized = await manipulateAsync(uri, [{ resize: { width: 1080 } }], {
      compress: 1,
      format: SaveFormat.PNG,
    });

    if (filter === 'none') {
      const final = await manipulateAsync(resized.uri, [], {
        compress: 0.88,
        format: SaveFormat.JPEG,
      });
      return final.uri;
    }

    // Web: Use Canvas API
    if (Platform.OS === 'web') {
      const base64 = await FileSystem.readAsStringAsync(resized.uri, {
        encoding: 'base64' as any,
      });
      const filtered = await applyCanvasFilter(base64, filter);
      const fileUri = `${FileSystem.cacheDirectory}filtered_${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(fileUri, filtered, {
        encoding: 'base64' as any,
      });
      return fileUri;
    }

    // Native: Use expo-image-manipulator with quality adjustments
    const compressValue = filter === 'vivid' ? 0.95 : filter === 'warm' ? 0.92 : 0.90;
    const final = await manipulateAsync(resized.uri, [], {
      compress: compressValue,
      format: SaveFormat.JPEG,
    });
    return final.uri;
  } catch (e) {
    console.error('Filter error:', e);
    return uri;
  }
}

function applyCanvasFilter(
  base64: string,
  filter: 'natural' | 'vivid' | 'warm'
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;

      if (filter === 'natural') {
        ctx.filter = 'brightness(1.05) contrast(1.02) saturate(1.1)';
      } else if (filter === 'vivid') {
        ctx.filter = 'brightness(1.08) contrast(1.15) saturate(1.25)';
      } else if (filter === 'warm') {
        ctx.filter = 'brightness(1.1) contrast(1.05) saturate(1.15) sepia(0.15)';
      }

      ctx.drawImage(img, 0, 0);
      const result = canvas.toDataURL('image/jpeg', 0.88).split(',')[1];
      resolve(result);
    };
    img.src = `data:image/png;base64,${base64}`;
  });
}
