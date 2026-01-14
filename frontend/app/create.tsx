import { useState } from 'react';
import { 
  View, Text, TextInput, Image, TouchableOpacity, StyleSheet, 
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView, ScrollView, Keyboard 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSecure } from '../utils/storage'; 
import api, { BASE_URL } from '../utils/api';

export default function CreatePostScreen() {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permission Denied", "We need access to your photos.");
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, 
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const handlePost = async () => {
    if (!content.trim() && !image) {
      Alert.alert("Empty Post", "Please add text or an image.");
      return;
    }

    setLoading(true);
    
    // 1. Create FormData
    const formData = new FormData();
    formData.append('content', content);

    if (image) {
      const filename = image.split('/').pop() || 'upload.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;

      // ⚠️ FIX FOR WEB / BLOB URIs
      // If we are on Web or the URI is a blob, we must convert it to a binary Blob
      if (Platform.OS === 'web' || image.startsWith('blob:')) {
        const response = await fetch(image);
        const blob = await response.blob();
        formData.append('media', blob, filename);
      } 
      // ⚠️ NATIVE (Android/iOS)
      else {
        
        formData.append('media', {
          uri: Platform.OS === 'android' ? image : image.replace('file://', ''),
          name: filename,
          type: type,
        } as any);
      }
    }

    try {
      const token = await getSecure('accessToken');
      

      const response = await fetch(`${BASE_URL}/api/posts/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // No Content-Type (fetch handles boundary automatically)
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        console.log("Server Error Response:", data);
        throw new Error("Upload failed");
      }

      console.log("Success:", data);
      router.back(); 

    } catch (error) {
      console.log("Upload Error:", error);
      Alert.alert("Error", "Could not upload post.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Post</Text>
        <TouchableOpacity onPress={handlePost} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#0095f6"/> : <Text style={styles.postText}>Share</Text>}
        </TouchableOpacity>
      </View>

      {/* Content */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.input}
              placeholder="What's happening?"
              multiline
              value={content}
              onChangeText={setContent}
              placeholderTextColor="#999"
            />

            {image && (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: image }} style={styles.previewImage} />
                <TouchableOpacity style={styles.removeBtn} onPress={() => setImage(null)}>
                    <Ionicons name="close" size={20} color="white" />
                </TouchableOpacity>
              </View>
            )}
        </ScrollView>

        {/* Toolbar */}
        <View style={styles.toolbar}>
            <TouchableOpacity style={styles.mediaBtn} onPress={pickImage}>
              <Ionicons name="images-outline" size={26} color="#0095f6" />
              <Text style={styles.mediaText}>Add Photo</Text>
            </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f0f0f0' 
  },
  cancelText: { fontSize: 16, color: '#333' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  postText: { fontSize: 16, color: '#0095f6', fontWeight: '700' },
  scrollContent: { padding: 16 },
  input: { fontSize: 18, minHeight: 80, textAlignVertical: 'top', color: '#000', marginBottom: 20 },
  imagePreviewContainer: { position: 'relative', marginBottom: 20 },
  previewImage: { width: '100%', height: 300, borderRadius: 12, backgroundColor: '#f0f0f0', resizeMode: 'cover' },
  removeBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 15, padding: 6 },
  toolbar: { 
    flexDirection: 'row', alignItems: 'center', 
    borderTopWidth: 1, borderColor: '#f0f0f0', 
    padding: 12, backgroundColor: '#fff',
    justifyContent: 'flex-start' 
  },
  mediaBtn: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  mediaText: { marginLeft: 8, color: '#0095f6', fontSize: 16, fontWeight: '600' }
});