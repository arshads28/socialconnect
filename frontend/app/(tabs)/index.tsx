import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  Image, 
  ActivityIndicator, 
  RefreshControl, 
  TouchableOpacity, 
  TextInput, 
  Alert,
  Platform,
  Modal
} from 'react-native';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router'; 
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker'; 

import api, { BASE_URL } from '../../utils/api';
import { useAuth } from '../../context/AuthContext'; 
import { getSecure } from '../../utils/storage';
import NetInfo from '@react-native-community/netinfo';
import { addToQueue } from '../../utils/db';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';

export default function HomeScreen() {
  const router = useRouter();
  const { signOut, userToken, isLoading: authLoading } = useAuth();
  
  // Theme Setup
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

  // Feed State
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Create Post State
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImage, setNewPostImage] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [menuVisible, setMenuVisible] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !userToken) return;
    fetchFeed();
  }, [authLoading, userToken]);

  // 1. CREATE POST LOGIC (Unchanged)
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'We need access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], 
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      setNewPostImage(result.assets[0].uri);
    }
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim() && !newPostImage) return;

    setIsPosting(true);
    const netState = await NetInfo.fetch(); 

    if (!netState.isConnected) {
        const queued = addToQueue('CREATE_POST', { 
            content: newPostContent, 
            imageUri: newPostImage 
        });

        if (!queued) {
            Alert.alert("Queue Full", "You have too many pending actions. Connect to internet to sync.");
            setIsPosting(false);
            return;
        }

        const optimisticPost = {
            id: Date.now(), 
            content: newPostContent,
            media: newPostImage,
            created_at: new Date().toISOString(),
            author: { username: 'me', avatar: null }, 
            is_liked: false,
            likes_count: 0,
            comments_count: 0,
            is_local: true 
        };

        setPosts(prev => [optimisticPost, ...prev]);
        setNewPostContent('');
        setNewPostImage(null);
        setIsPosting(false);
        
        Alert.alert("Offline", "Post saved. Will send when online.");
        return;
    }

    try {
      const token = await getSecure('accessToken');
      if (!token) {
        signOut();
        return;
      }

      const formData = new FormData();
      formData.append('content', newPostContent);

      if (newPostImage) {
        const filename = newPostImage.split('/').pop() || 'upload.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;

        if (Platform.OS === 'web') {
           const res = await fetch(newPostImage);
           const blob = await res.blob();
           formData.append('media', blob, filename);
        } else {
           formData.append('media', {
             uri: Platform.OS === 'android' ? newPostImage : newPostImage.replace('file://', ''),
             name: filename,
             type,
           } as any);
        }
      }

      const response = await fetch(`${BASE_URL}/api/updates/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.status === 401) {
        signOut();
        return;
      }

      const data = await response.json();

      if (response.ok) {
        setNewPostContent('');
        setNewPostImage(null);
        setPosts((prev) => [data, ...prev]); 
      } else {
        Alert.alert("Error", "Could not create post");
      }

    } catch (error) {
      console.log("Create Post Error:", error);
      Alert.alert("Error", "Network error occurred");
    } finally {
      setIsPosting(false);
    }
  };

  // 2. FEED LOGIC (Unchanged)
  const fetchFeed = async () => {
    try {
      const response = await api.get('/api/updates/');
      if (response.data.results) {
        setPosts(response.data.results);
        setNextUrl(response.data.next);
      } else {
        setPosts([]);
      }
    } catch (error: any) {
      console.log("Error fetching feed:", error);
      if (error.response?.status === 401) signOut(); 
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchMore = async () => {
    if (!nextUrl || loadingMore) return; 
    setLoadingMore(true);
    try {
      const response = await api.get(nextUrl);
      if (response.data.results) {
        setPosts((prevPosts) => [...prevPosts, ...response.data.results]);
        setNextUrl(response.data.next);
      }
    } catch (error) {
      console.log("Error fetching more:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleLike = async (postId: string, index: number) => {
    const newPosts = [...posts];
    const post = newPosts[index];
    const wasLiked = post.is_liked;

    post.is_liked = !wasLiked;
    post.likes_count = wasLiked ? post.likes_count - 1 : post.likes_count + 1;
    setPosts(newPosts);

    try {
      await api.post(`/api/updates/${postId}/like/`);
    } catch (error) {
      post.is_liked = wasLiked; 
      post.likes_count = wasLiked ? post.likes_count + 1 : post.likes_count - 1; 
      setPosts([...posts]);
    }
  };

  const handleDeletePost = async (postId: string) => {
    const netState = await NetInfo.fetch();

    setPosts(posts.filter(p => p.id !== postId));

    if (!netState.isConnected) {
        const queued = addToQueue('DELETE_POST', { postId });
        if (!queued) {
            Alert.alert("Sync Error", "Could not queue deletion. Connect to internet.");
        }
        return;
    }

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this update?')) {
        try {
          await api.delete(`/api/updates/${postId}/`);
        } catch (error) {
          alert('Could not Delete Update');
        }
      }
    } else {
      Alert.alert(
        'Delete Update',
        'Are you sure you want to delete this post?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await api.delete(`/api/updates/${postId}/`);
              } catch (error) {
                Alert.alert('Error', 'Could not Delete Update');
              }
            },
          },
        ]
      );
    }
  };

  // 3. COMPONENTS
  const renderCreatePostCard = () => (
    <View style={[styles.createCard, { backgroundColor: colors.card, shadowColor: isDark ? 'transparent' : '#000' }]}>
      <View style={styles.createInputRow}>
        <TextInput
          style={[styles.createInput, { color: colors.text }]}
          placeholder="What's happening?"
          placeholderTextColor={colors.subText}
          multiline
          value={newPostContent}
          onChangeText={setNewPostContent}
        />
      </View>
      {newPostImage && (
        <View style={styles.previewContainer}>
          <Image source={{ uri: newPostImage }} style={styles.previewImage} />
          <TouchableOpacity style={styles.removeBtn} onPress={() => setNewPostImage(null)}>
            <Ionicons name="close" size={16} color="white" />
          </TouchableOpacity>
        </View>
      )}
      <View style={[styles.createActions, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={styles.mediaBtn} onPress={pickImage}>
          <Ionicons name="images-outline" size={22} color={colors.tint} />
          <Text style={[styles.mediaText, { color: colors.tint }]}>Media</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.postBtn, 
            { backgroundColor: colors.text },
            (!newPostContent && !newPostImage) && { backgroundColor: isDark ? '#444' : '#ccc' }
          ]}
          onPress={handleCreatePost}
          disabled={(!newPostContent && !newPostImage) || isPosting}
        >
          {isPosting ? <ActivityIndicator size="small" color={colors.background} /> : <Text style={[styles.postBtnText, { color: colors.background }]}>Post</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPostItem = ({ item, index }: { item: any, index: number }) => {
    return (
      <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }, item.is_local && { opacity: 0.7 }]}>
        <View style={styles.cardHeader}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            onPress={() => router.push(`/profile/${item.author.username}`)}
          >
            <Image source={{ uri: item.author.avatar || 'https://via.placeholder.com/50' }} style={[styles.avatar, { borderColor: colors.border, borderWidth: 1 }]} />
            <View>
              <Text style={[styles.username, { color: colors.text }]}>@{item.author.username}</Text>
              <Text style={[styles.date, { color: colors.subText }]}>
                {new Date(item.created_at).toLocaleDateString()}
                {item.is_local ? ' • Pending' : ''}
              </Text>
            </View>
          </TouchableOpacity>

          {item.is_author && (
            <TouchableOpacity onPress={() => setMenuVisible(item.id)} style={styles.menuBtn}>
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.subText} />
            </TouchableOpacity>
          )}
        </View>
        {item.content ? <Text style={[styles.content, { color: colors.text }]}>{item.content}</Text> : null}
        {item.media && (
          item.media_type === 'video' ? (
             <View style={[styles.videoPlaceholder, { backgroundColor: colors.card }]}><Ionicons name="play-circle-outline" size={64} color={colors.subText} /></View>
          ) : (
             <Image source={{ uri: item.media }} style={[styles.postImage, { backgroundColor: colors.card }]} resizeMode="cover"/>
          )
        )}
        <View style={styles.footer}>
          <TouchableOpacity onPress={() => handleLike(item.id, index)} style={styles.actionButton}>
            <Ionicons name={item.is_liked ? "heart" : "heart-outline"} size={26} color={item.is_liked ? colors.danger : colors.icon} />
            <Text style={[styles.actionText, { color: colors.icon }, item.is_liked && {color: colors.danger}]}>{item.likes_count}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push(`/comments/${item.id}`)}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.icon} />
            <Text style={[styles.actionText, { color: colors.icon }]}>{item.comments_count || 0}</Text>
          </TouchableOpacity>
        </View>

        {/* Menu Modal */}
        {menuVisible === item.id && (
          <Modal
            visible={true}
            transparent
            animationType="none"
            onRequestClose={() => setMenuVisible(null)}
          >
            <TouchableOpacity 
              style={styles.modalOverlay} 
              activeOpacity={1} 
              onPress={() => setMenuVisible(null)}
            >
              <TouchableOpacity 
                style={[styles.menuModalPost, { backgroundColor: colors.card }]}
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
              >
                <TouchableOpacity 
                  style={styles.menuOption} 
                  onPress={() => {
                    setMenuVisible(null);
                    setTimeout(() => handleDeletePost(item.id), 100);
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  <Text style={[styles.menuOptionTextDelete, { color: colors.danger }]}>Delete Update</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? '#000' : '#f2f2f2' }]} edges={['top']}>
      
      <View style={[styles.topBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
         <Text style={[styles.logo, { color: colors.text }]}>Connect</Text>
         <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
             <TouchableOpacity onPress={() => router.push('/(tabs)/explore')}>
                <Ionicons name="search-outline" size={26} color={colors.icon} />
             </TouchableOpacity>
             <TouchableOpacity onPress={() => router.push('/create')}>
                <Ionicons name="camera-outline" size={30} color={colors.icon} />
             </TouchableOpacity>
         </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPostItem}
          keyExtractor={(item) => item.id.toString()}
          ListHeaderComponent={renderCreatePostCard()} 
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchFeed(); }} tintColor={colors.tint} />}
          onEndReached={fetchMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.tint} style={{ margin: 20 }} /> : null}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.subText }]}>No posts yet.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  logo: { fontSize: 24, fontWeight: '800', fontStyle: 'italic' },
  
  createCard: {
    borderRadius: 12, margin: 16, padding: 16,
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  createInputRow: { marginBottom: 10 },
  createInput: { fontSize: 16, minHeight: 40 },
  createActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 12, marginTop: 5 },
  mediaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mediaText: { fontWeight: '600', fontSize: 14 },
  postBtn: { paddingVertical: 6, paddingHorizontal: 18, borderRadius: 20 },
  postBtnText: { fontWeight: '700', fontSize: 14 },
  previewContainer: { position: 'relative', marginBottom: 10, borderRadius: 8, overflow: 'hidden' },
  previewImage: { width: '100%', height: 200, borderRadius: 8 },
  removeBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },

  card: { marginBottom: 10, borderTopWidth: 1, borderBottomWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  username: { fontWeight: '700', fontSize: 15 },
  date: { fontSize: 12 },
  content: { fontSize: 15, paddingHorizontal: 12, marginBottom: 12, lineHeight: 22 },
  postImage: { width: '100%', height: 350 },
  videoPlaceholder: { width: '100%', height: 350, justifyContent: 'center', alignItems: 'center' },
  footer: { flexDirection: 'row', paddingTop: 12, paddingBottom: 12, paddingHorizontal: 12 },
  actionButton: { flexDirection: 'row', alignItems: 'center', marginRight: 24 },
  actionText: { marginLeft: 6, fontSize: 14, fontWeight: '600' },
  menuBtn: { padding: 8 },
  emptyText: { textAlign: 'center', marginTop: 50 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  menuModalPost: { borderRadius: 8, width: 180, position: 'absolute', top: 100, right: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  menuOption: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  menuOptionTextDelete: { fontSize: 16, fontWeight: '500' },
});