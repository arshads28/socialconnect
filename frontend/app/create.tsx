import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSecure } from '../utils/storage';
import { BASE_URL } from '../utils/api'; // Import BASE_URL directly
import { useAuth } from '../context/AuthContext'; // Import Auth Context

export default function CreatePostScreen() {
  const router = useRouter();
  const { signOut } = useAuth(); // Get signOut to handle 401s
  const [content, setContent] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // -------------------------
  // Pick image
  // -------------------------
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'We need access to your photos to upload.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], 
      allowsEditing: true,
      quality: 0.8, 
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  // -------------------------
  // Submit post
  // -------------------------
  const handlePost = async () => {
    if (!content.trim() && !image) {
      Alert.alert('Empty Post', 'Please add text or an image.');
      return;
    }

    setLoading(true);

    try {
      // 1. Check Token First
      const token = await getSecure('accessToken');
      if (!token) {
        Alert.alert("Session Expired", "Please log in again.");
        signOut();
        return;
      }

      // 2. Prepare Form Data
      const formData = new FormData();
      formData.append('content', content);

      if (image) {
        const filename = image.split('/').pop() || 'upload.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;

        if (Platform.OS === 'web') {
          const response = await fetch(image);
          const blob = await response.blob();
          formData.append('media', blob, filename);
        } else {
          // Android/iOS specific FormData handling
          formData.append('media', {
            uri: Platform.OS === 'android' ? image : image.replace('file://', ''),
            name: filename,
            type: type,
          } as any);
        }
      }

      // 3. Send Request using FETCH (not Axios) for file uploads
      console.log("Uploading to:", `${BASE_URL}/api/posts/`);
      
      const response = await fetch(`${BASE_URL}/api/posts/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // NEVEr set 'Content-Type': 'multipart/form-data' manually in fetch!
          // The browser/engine sets it automatically with the boundary.
        },
        body: formData,
      });

      // 4. Handle Response
      if (response.status === 401) {
        console.log("Token expired during upload");
        signOut();
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        console.error("Server Error:", data);
        throw new Error("Server rejected the post");
      }

      console.log("Upload Success:", data);
      router.back();

    } catch (error: any) {
      console.error('Post upload error:', error);
      Alert.alert('Upload Failed', 'Check your internet connection or try a smaller image.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>New Post</Text>

        <TouchableOpacity onPress={handlePost} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color="#0095f6" />
          ) : (
            <Text style={styles.postText}>Share</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
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
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => setImage(null)}
              >
                <Ionicons name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  cancelText: { fontSize: 16, color: '#333' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  postText: { fontSize: 16, color: '#0095f6', fontWeight: '700' },
  scrollContent: { padding: 16 },
  input: {
    fontSize: 18,
    minHeight: 80,
    textAlignVertical: 'top',
    color: '#000',
    marginBottom: 20,
  },
  imagePreviewContainer: { position: 'relative', marginBottom: 20 },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    resizeMode: 'cover',
  },
  removeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 15,
    padding: 6,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#f0f0f0',
    padding: 12,
    backgroundColor: '#fff',
  },
  mediaBtn: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  mediaText: {
    marginLeft: 8,
    color: '#0095f6',
    fontSize: 16,
    fontWeight: '600',
  },
});