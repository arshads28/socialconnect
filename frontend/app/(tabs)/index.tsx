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
import { processMedia } from '../../utils/mediaProcessor';
import UploadManager from '../../utils/UploadManager';

export default function HomeScreen() {
  const router = useRouter();
  const { signOut, userToken, isLoading: authLoading } = useAuth();
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImage, setNewPostImage] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [menuVisible, setMenuVisible] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !userToken) return;
    fetchFeed();
  }, [authLoading, userToken]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'We need access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All, 
      allowsEditing: true,
      quality: 1, 
    });
    if (!result.canceled) {
      setNewPostImage(result.assets[0].uri);
    }
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim() && !newPostImage) return;

    // 1. In-App Processing
    let processedUri = newPostImage;
    let mediaType: 'image' | 'video' = 'image';
    
    if (newPostImage) {
        const isVideo = newPostImage.endsWith('.mp4') || newPostImage.endsWith('.mov');
        mediaType = isVideo ? 'video' : 'image';
        const processed = await processMedia(newPostImage, mediaType);
        processedUri = processed.uri;
    }

    const optimisticId = Date.now().toString();
    const token = await getSecure('accessToken');

    // 2. Optimistic UI
    const optimisticPost = {
        id: optimisticId, 
        content: newPostContent,
        media: processedUri, // Display local immediately
        local_media_uri: processedUri, // ✅ HARDENING: Keep reference to local file
        media_type: mediaType,
        created_at: new Date().toISOString(),
        author: { username: 'me', avatar: null }, 
        is_liked: false,
        likes_count: 0,
        comments_count: 0,
        is_local: true,
        media_status: newPostImage ? 'uploading' : 'sent',
        media_progress: 0,
        media_failed: false,
    };

    setPosts(prev => [optimisticPost, ...prev]);
    setNewPostContent('');
    setNewPostImage(null);

    // 3. Offline Check
    const netState = await NetInfo.fetch(); 
    if (!netState.isConnected) {
        addToQueue('CREATE_POST', { content: newPostContent, imageUri: processedUri });
        Alert.alert("Offline", "Post saved. Will send when online.");
        return;
    }

    // 4. Upload
    if (processedUri && newPostImage) {
        UploadManager.add({
            id: optimisticId,
            uri: processedUri,
            type: mediaType,
            endpoint: `${BASE_URL}/api/updates/`,
            headers: { 'Authorization': `Bearer ${token}` },
            additionalData: { 'content': newPostContent },
            onProgress: (percent) => {
                setPosts(prev => prev.map(p => p.id === optimisticId ? { ...p, media_progress: percent } : p));
            },
            onSuccess: (data) => {
                // ✅ HARDENING: Merge server data but explicitly set status flags
                setPosts(prev => prev.map(p => p.id === optimisticId ? {
                    ...data, // Server data (real ID, real URL)
                    media_status: 'sent',
                    media_progress: 100,
                    is_local: false,
                    local_media_uri: null // Clean up
                } : p));
            },
            onError: (err) => {
                console.log("Upload Error", err);
                setPosts(prev => prev.map(p => p.id === optimisticId ? { ...p, media_failed: true, media_status: 'failed' } : p));
            }
        });
    } else {
        // Text Only
        try {
             await api.post('/api/updates/', { content: newPostContent });
             fetchFeed();
        } catch(e) {
             Alert.alert("Error", "Could not send text post");
             setPosts(prev => prev.filter(p => p.id !== optimisticId));
        }
    }
  };

  const retryUpload = async (post: any) => {
     // ✅ HARDENING: Check if we have the local file
     if (!post.local_media_uri) {
         Alert.alert("Error", "Original file missing, cannot retry.");
         return;
     }

     const token = await getSecure('accessToken');
     
     setPosts(prev => prev.map(p => p.id === post.id ? { ...p, media_failed: false, media_status: 'uploading', media_progress: 0 } : p));
     
     UploadManager.add({
        id: post.id,
        uri: post.local_media_uri, // ✅ USE LOCAL URI, NOT SERVER URL
        type: post.media_type || 'image',
        endpoint: `${BASE_URL}/api/updates/`,
        headers: { 'Authorization': `Bearer ${token}` },
        additionalData: { 'content': post.content },
        onProgress: (percent) => {
            setPosts(prev => prev.map(p => p.id === post.id ? { ...p, media_progress: percent } : p));
        },
        onSuccess: (data) => {
            setPosts(prev => prev.map(p => p.id === post.id ? {
                ...data,
                media_status: 'sent',
                media_progress: 100,
                is_local: false,
                local_media_uri: null
            } : p));
        },
        onError: () => {
            setPosts(prev => prev.map(p => p.id === post.id ? { ...p, media_failed: true } : p));
        }
    });
  };

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
    } catch (error) { console.log(error); } finally { setLoadingMore(false); }
  };

  const handleLike = async (postId: string, index: number) => {
    const newPosts = [...posts];
    const post = newPosts[index];
    const wasLiked = post.is_liked;
    post.is_liked = !wasLiked;
    post.likes_count = wasLiked ? post.likes_count - 1 : post.likes_count + 1;
    setPosts(newPosts);
    try { await api.post(`/api/updates/${postId}/like/`); } catch (error) { 
        post.is_liked = wasLiked; 
        post.likes_count = wasLiked ? post.likes_count + 1 : post.likes_count - 1; 
        setPosts([...posts]);
    }
  };

  const handleDeletePost = async (postId: string) => {
    const netState = await NetInfo.fetch();
    setPosts(posts.filter(p => p.id !== postId));
    if (!netState.isConnected) {
        addToQueue('DELETE_POST', { postId });
        return;
    }
    Alert.alert(
      'Delete Update', 'Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
            try { await api.delete(`/api/updates/${postId}/`); } catch (error) { Alert.alert('Error', 'Could not Delete Update'); }
          },
        },
      ]
    );
  };

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
          style={[styles.postBtn, { backgroundColor: colors.text }]}
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
      <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }, item.is_local && { opacity: 0.9 }]}>
        <View style={styles.cardHeader}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => router.push(`/profile/${item.author.username}`)}>
            <Image source={{ uri: item.author.avatar || 'https://via.placeholder.com/50' }} style={[styles.avatar, { borderColor: colors.border, borderWidth: 1 }]} />
            <View>
              <Text style={[styles.username, { color: colors.text }]}>@{item.author.username}</Text>
              <Text style={[styles.date, { color: colors.subText }]}>{new Date(item.created_at).toLocaleDateString()}{item.is_local ? ' • Sending...' : ''}</Text>
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
          <View>
            {item.media_type === 'video' ? (
                 <View style={[styles.videoPlaceholder, { backgroundColor: colors.card }]}><Ionicons name="play-circle-outline" size={64} color={colors.subText} /></View>
            ) : (
                 <Image source={{ uri: item.media }} style={[styles.postImage, { backgroundColor: colors.card }]} resizeMode="cover"/>
            )}

            {/* PROGRESS OVERLAY */}
            {item.media_status === 'uploading' && (
                <View style={styles.uploadOverlay}>
                    <ActivityIndicator color="#fff" />
                    <Text style={{color:'#fff', fontWeight:'bold', marginTop: 5}}>{item.media_progress}%</Text>
                </View>
            )}

            {/* RETRY BUTTON */}
            {item.media_failed && (
                <TouchableOpacity style={styles.retryBtn} onPress={() => retryUpload(item)}>
                    <Ionicons name="refresh" size={16} color="#fff" />
                    <Text style={{color:'#fff', fontSize: 12}}>Retry</Text>
                </TouchableOpacity>
            )}
          </View>
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
          <Modal visible={true} transparent animationType="none" onRequestClose={() => setMenuVisible(null)}>
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMenuVisible(null)}>
              <TouchableOpacity style={[styles.menuModalPost, { backgroundColor: colors.card }]} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                <TouchableOpacity style={styles.menuOption} onPress={() => { setMenuVisible(null); setTimeout(() => handleDeletePost(item.id), 100); }}>
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
             <TouchableOpacity onPress={() => router.push('/(tabs)/explore')}><Ionicons name="search-outline" size={26} color={colors.icon} /></TouchableOpacity>
             <TouchableOpacity onPress={() => router.push('/create')}><Ionicons name="camera-outline" size={30} color={colors.icon} /></TouchableOpacity>
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
  createCard: { borderRadius: 12, margin: 16, padding: 16, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
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
  uploadOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  retryBtn: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'red', padding: 8, borderRadius: 20, flexDirection: 'row', alignItems:'center', gap: 4 },
});