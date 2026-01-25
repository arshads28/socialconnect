import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

export const processMedia = async (uri: string, type: 'image' | 'video') => {
  try {
    if (type === 'video') {
      // For videos, we return as-is (Video compression requires native modules like ffmpeg)
      // Or checking file size to ensure it's not too huge
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && info.size > 50 * 1024 * 1024) { // 50MB limit
         throw new Error("Video too large");
      }
      return { uri, type };
    }

    // IMAGE COMPRESSION
    // Resize to max 1080px width, compress to 0.7 quality
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1080 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );

    return { uri: result.uri, type: 'image' };
  } catch (error) {
    console.log("Media Processing Error:", error);
    return { uri, type }; // Fallback to original
  }
};