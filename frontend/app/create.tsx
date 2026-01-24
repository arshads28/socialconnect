import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { getSecure } from '../utils/storage';
import { BASE_URL } from '../utils/api';
import { applyFilter } from '../utils/imageFilters';


export default function CreateCameraScreen() {
  const router = useRouter();

  // Permissions
  const [permission, requestPermission] = useCameraPermissions();

  // Camera state
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');

  // Image / preview
  const [photo, setPhoto] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);

  // Filters
  const [activeFilter, setActiveFilter] = useState<'none' | 'natural' | 'vivid' | 'warm'>('natural');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  if (!permission) return <View style={{ flex: 1 }} />;

  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={{ marginBottom: 10 }}>
          We need camera permission
        </Text>
        <TouchableOpacity onPress={requestPermission} style={styles.btnPost}>
          <Text style={styles.btnPostText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // -------------------------
  // Camera actions
  // -------------------------
  const toggleCameraType = () => {
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const result = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: true,
      });
      if (result?.uri) {
        // Apply selected filter to the photo
        const filtered = await applyFilter(result.uri, activeFilter);
        setPhoto(filtered);
      }
    } catch (e) {
      console.error('Camera error:', e);
      Alert.alert('Error', 'Could not take picture');
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: true,
    });
    if (!result.canceled) {
      const filtered = await applyFilter(result.assets[0].uri, activeFilter);
      setPhoto(filtered);
    }
  };

  const handlePost = async () => {
    if (!photo) return;

    setLoading(true);
    try {
      const token = await getSecure('accessToken');
      if (!token) {
        Alert.alert('Error', 'Please log in again.');
        return;
      }

      const formData = new FormData();
      formData.append('content', caption);

      const filename = photo.split('/').pop() || 'photo.jpg';
      const type = 'image/jpeg';

      if (Platform.OS === 'web') {
        const res = await fetch(photo);
        const blob = await res.blob();
        formData.append('media', blob, filename);
      } else {
        formData.append('media', {
          uri: Platform.OS === 'android' ? photo : photo.replace('file://', ''),
          name: filename,
          type,
        } as any);
      }

      const res = await fetch(`${BASE_URL}/api/updates/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        console.error(err);
        Alert.alert('Upload failed');
        return;
      }

      router.replace('/(tabs)');
    } catch (e) {
      console.error(e);
      Alert.alert('Network error');
    } finally {
      setLoading(false);
    }
  };

  if (photo) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar hidden />
        <View style={styles.previewHeader}>
          <TouchableOpacity onPress={() => setPhoto(null)} style={styles.backBtn}>
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnPost}
            onPress={handlePost}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnPostText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        <Image source={{ uri: photo }} style={styles.previewImage} resizeMode="cover" />

        <View style={styles.captionContainer}>
          <TextInput
            style={styles.captionInput}
            placeholder="Add a caption..."
            placeholderTextColor="#999"
            multiline
            value={caption}
            onChangeText={setCaption}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        enableTorch={false}
      />

      {/* Live Filter Overlay */}
      {activeFilter !== 'none' && (
        <View style={[StyleSheet.absoluteFill, getFilterStyle(activeFilter)]} pointerEvents="none" />
      )}

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowFilters(!showFilters)} style={styles.iconBtn}>
          <Ionicons name="color-filter" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filter Selector */}
      {showFilters && (
        <View style={styles.filterBar}>
          {(['none', 'natural', 'vivid', 'warm'] as const).map((filter) => (
            <TouchableOpacity
              key={filter}
              onPress={() => {
                setActiveFilter(filter);
                setShowFilters(false);
              }}
              style={[
                styles.filterBtn,
                activeFilter === filter && styles.filterBtnActive,
              ]}
            >
              <Text style={styles.filterText}>
                {filter === 'none' ? 'Off' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Bottom Controls */}
      <View style={styles.cameraBottomBar}>
        <TouchableOpacity onPress={pickImage} style={styles.iconBtn}>
          <Ionicons name="images" size={28} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity onPress={takePicture} style={styles.shutterOuter}>
          <View style={styles.shutterInner} />
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleCameraType} style={styles.iconBtn}>
          <Ionicons name="camera-reverse" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },

  cameraBottomBar: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 40,
  },

  iconBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  shutterOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 6,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },

  previewHeader: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backBtn: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  captionContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
  },
  captionInput: {
    color: '#fff',
    fontSize: 16,
    minHeight: 50,
  },

  btnPost: {
    backgroundColor: '#0095f6',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 25,
  },
  btnPostText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  filterBar: {
    position: 'absolute',
    top: 110,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 25,
    padding: 10,
    zIndex: 10,
  },
  filterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 15,
  },
  filterBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  filterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

function getFilterStyle(filter: 'natural' | 'vivid' | 'warm') {
  switch (filter) {
    case 'natural':
      return {
        backgroundColor: 'rgba(255, 240, 220, 0.08)',
      };
    case 'vivid':
      return {
        backgroundColor: 'rgba(255, 100, 150, 0.06)',
      };
    case 'warm':
      return {
        backgroundColor: 'rgba(255, 200, 100, 0.12)',
      };
  }
}
