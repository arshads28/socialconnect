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

export default function HomeScreen() {
  const router = useRouter();
  const { signOut, userToken, isLoading: authLoading } = useAuth();
  
  // Feed State
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Create Post State (For the embedded card)
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImage, setNewPostImage] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [menuVisible, setMenuVisible] = useState<string | null>(null);

  useEffect(() => {

    if (authLoading || !userToken) return;

    fetchFeed();
  }, [authLoading, userToken]);

  // ------------------------------------------------------------------
  // 1. CREATE POST LOGIC (Embedded Card)
  // ------------------------------------------------------------------
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

      const response = await fetch(`${BASE_URL}/api/posts/`, {
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

  // ------------------------------------------------------------------
  // 2. FEED LOGIC
  // ------------------------------------------------------------------
  const fetchFeed = async () => {
    try {
      const response = await api.get('/api/posts/');
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
      await api.post(`/api/posts/${postId}/like/`);
    } catch (error) {
      post.is_liked = wasLiked; 
      post.likes_count = wasLiked ? post.likes_count + 1 : post.likes_count - 1; 
      setPosts([...posts]);
    }
  };

  const handleDeletePost = async (postId: string) => {
    console.log('Delete post clicked:', postId);
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this post?')) {
        console.log('Deleting post:', postId);
        try {
          await api.delete(`/api/posts/${postId}/`);
          setPosts(posts.filter(p => p.id !== postId));
          console.log('Post deleted successfully');
        } catch (error) {
          console.error('Delete error:', error);
          alert('Could not delete post');
        }
      }
    } else {
      Alert.alert(
        'Delete Post',
        'Are you sure you want to delete this post?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              console.log('Deleting post:', postId);
              try {
                await api.delete(`/api/posts/${postId}/`);
                setPosts(posts.filter(p => p.id !== postId));
                console.log('Post deleted successfully');
              } catch (error) {
                console.error('Delete error:', error);
                Alert.alert('Error', 'Could not delete post');
              }
            },
          },
        ]
      );
    }
  };

  // ------------------------------------------------------------------
  // 3. COMPONENTS
  // ------------------------------------------------------------------
  
  const renderCreatePostCard = () => (
    <View style={styles.createCard}>
      <View style={styles.createInputRow}>
        <TextInput
          style={styles.createInput}
          placeholder="What's happening?"
          placeholderTextColor="#666"
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
      <View style={styles.createActions}>
        <TouchableOpacity style={styles.mediaBtn} onPress={pickImage}>
          <Ionicons name="images-outline" size={22} color="#0095f6" />
          <Text style={styles.mediaText}>Media</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.postBtn, (!newPostContent && !newPostImage) && styles.postBtnDisabled]}
          onPress={handleCreatePost}
          disabled={(!newPostContent && !newPostImage) || isPosting}
        >
          {isPosting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.postBtnText}>Post</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPostItem = ({ item, index }: { item: any, index: number }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          {/* ✅ FIX: Wrap Avatar and Username in TouchableOpacity */}
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            onPress={() => router.push(`/profile/${item.author.username}`)}
          >
            <Image source={{ uri: item.author.avatar || 'https://via.placeholder.com/50' }} style={styles.avatar} />
            <View>
              <Text style={styles.username}>@{item.author.username}</Text>
              <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
          </TouchableOpacity>

          {item.is_author && (
            <TouchableOpacity onPress={() => setMenuVisible(item.id)} style={styles.menuBtn}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
        {item.content ? <Text style={styles.content}>{item.content}</Text> : null}
        {item.media && (
          item.media_type === 'video' ? (
             <View style={styles.videoPlaceholder}><Ionicons name="play-circle-outline" size={64} color="white" /></View>
          ) : (
             <Image source={{ uri: item.media }} style={styles.postImage} resizeMode="cover"/>
          )
        )}
        <View style={styles.footer}>
          <TouchableOpacity onPress={() => handleLike(item.id, index)} style={styles.actionButton}>
            <Ionicons name={item.is_liked ? "heart" : "heart-outline"} size={26} color={item.is_liked ? "#ff3040" : "#333"} />
            <Text style={[styles.actionText, item.is_liked && {color: '#ff3040'}]}>{item.likes_count}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push(`/comments/${item.id}`)}>
            <Ionicons name="chatbubble-outline" size={24} color="#333" />
            <Text style={styles.actionText}>{item.comments_count || 0}</Text>
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
                style={styles.menuModalPost}
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
              >
                <TouchableOpacity 
                  style={styles.menuOption} 
                  onPress={() => {
                    console.log('Delete button pressed for post:', item.id);
                    setMenuVisible(null);
                    setTimeout(() => handleDeletePost(item.id), 100);
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color="#ff3b30" />
                  <Text style={styles.menuOptionTextDelete}>Delete Post</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      
      {/* ----------------- TOP BAR ----------------- */}
      <View style={styles.topBar}>
         <Text style={styles.logo}>SocialConnect</Text>
         
         <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
             
             {/* 1. Search Button */}
             <TouchableOpacity onPress={() => router.push('/(tabs)/explore')}>
                <Ionicons name="search-outline" size={26} color="#000" />
             </TouchableOpacity>

             {/* 2. ✅ NEW CAMERA BUTTON (Snapchat Style) */}
             <TouchableOpacity onPress={() => router.push('/create')}>
                <Ionicons name="camera-outline" size={30} color="#000" />
             </TouchableOpacity>

         </View>
      </View>
      {/* ------------------------------------------- */}

      {loading ? (
        <ActivityIndicator size="large" color="#0095f6" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPostItem}
          keyExtractor={(item) => item.id.toString()}
          ListHeaderComponent={renderCreatePostCard} 
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchFeed(); }} />}
          onEndReached={fetchMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color="#0095f6" style={{ margin: 20 }} /> : null}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No posts yet.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f2f2f2' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor:'#fff', borderBottomWidth: 1, borderColor: '#e0e0e0' },
  logo: { fontSize: 24, fontWeight: '800', fontStyle: 'italic', color: '#000' },
  
  createCard: {
    backgroundColor: '#fff', borderRadius: 12, margin: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  createInputRow: { marginBottom: 10 },
  createInput: { fontSize: 16, color: '#333', minHeight: 40 },
  createActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 12, marginTop: 5 },
  mediaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mediaText: { color: '#0095f6', fontWeight: '600', fontSize: 14 },
  postBtn: { backgroundColor: '#111', paddingVertical: 6, paddingHorizontal: 18, borderRadius: 20 },
  postBtnDisabled: { backgroundColor: '#ccc' },
  postBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  previewContainer: { position: 'relative', marginBottom: 10, borderRadius: 8, overflow: 'hidden' },
  previewImage: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#f0f0f0' },
  removeBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },

  card: { backgroundColor: '#fff', marginBottom: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eee' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10, backgroundColor: '#eee' },
  username: { fontWeight: '700', fontSize: 15, color: '#000' },
  date: { color: '#888', fontSize: 12 },
  content: { fontSize: 15, paddingHorizontal: 12, marginBottom: 12, lineHeight: 22, color: '#333' },
  postImage: { width: '100%', height: 350, backgroundColor: '#eee' },
  videoPlaceholder: { width: '100%', height: 350, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  footer: { flexDirection: 'row', paddingTop: 12, paddingBottom: 12, paddingHorizontal: 12 },
  actionButton: { flexDirection: 'row', alignItems: 'center', marginRight: 24 },
  actionText: { marginLeft: 6, fontSize: 14, fontWeight: '600', color: '#555' },
  menuBtn: { padding: 8 },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#888' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  menuModalPost: { backgroundColor: '#fff', borderRadius: 8, width: 180, position: 'absolute', top: 100, right: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  menuOption: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  menuOptionTextDelete: { fontSize: 16, color: '#ff3b30', fontWeight: '500' },
});