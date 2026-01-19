import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export async function applyFilter(
  uri: string,
  filter: 'none' | 'natural' | 'vivid' | 'warm'
): Promise<string> {
  try {
    // 1. Resize Optimization
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

    // 2. Native Filter Application (Compression Tricks)
    const compressValue = filter === 'vivid' ? 0.95 : filter === 'warm' ? 0.92 : 0.90;
    
    // In a real native app, complex filters (sepia/contrast) require GLView or a library like 
    // react-native-image-filter-kit. Here we use compression/format tweaks as a placeholder 
    // for native "vibe" changes without crashing.
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