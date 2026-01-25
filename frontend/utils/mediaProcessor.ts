import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

export interface ProcessedMedia {
  uri: string;
  type: 'image' | 'video';
  width: number;
  height: number;
  size?: number; // bytes
}

export const processMedia = async (uri: string, type: 'image' | 'video'): Promise<ProcessedMedia> => {
  if (type === 'video') {
    // ⚠️ Expo can't compress video easily without FFmpeg-kit (which adds 20MB+ size).
    // Strategy: Validate size/duration, let backend re-encode if needed.
    const info = await FileSystem.getInfoAsync(uri);
    return {
        uri,
        type: 'video',
        width: 0, // Video dims hard to get without extra lib, backend will handle
        height: 0,
        size: info.exists ? info.size : 0
    };
  }

  // IMAGE PIPELINE: Resize -> Compress -> Convert to JPEG
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 720 } }], // Instagram standard width
      { 
        compress: 0.8, // 80% quality is indistinguishable but 1/4th size
        format: ImageManipulator.SaveFormat.JPEG 
      }
    );

    return {
        uri: result.uri,
        type: 'image',
        width: result.width,
        height: result.height,
        size: 0 // Not critical for images
    };
  } catch (error) {
    console.error("Media Processing Failed", error);
    throw error;
  }
};