import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router'; 
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { getSecure } from '../../utils/storage';

export default function HomeScreen() {
  const router = useRouter();
  const pathname = usePathname();
  
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    checkTokenAndFetch();
  }, []);

  const checkTokenAndFetch = async () => {
    if (pathname === '/login') return;
    const token = await getSecure('accessToken');
    if (!token) {
      router.replace('/login');
      return;
    }
    fetchFeed();
  };

  const fetchFeed = async () => {
    try {
      const response = await api.get('/api/posts/');
      setPosts(response.data);
    } catch (error: any) {
      console.log("Error fetching feed:", error);
      if (error.response?.status === 401) {
        router.replace('/login');
      } 
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  const renderItem = ({ item, index }: { item: any, index: number }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Image 
          source={{ uri: item.author.avatar || 'https://via.placeholder.com/50' }} 
          style={styles.avatar} 
        />
        <View>
          <Text style={styles.username}>@{item.author.username}</Text>
          <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
        </View>
      </View>

      {item.content ? <Text style={styles.content}>{item.content}</Text> : null}

      {item.media && item.media_type === 'image' && (
        <Image source={{ uri: item.media }} style={styles.postImage} resizeMode="cover"/>
      )}
      
      {item.media && item.media_type === 'video' && (
        <View style={styles.videoPlaceholder}>
           <Ionicons name="play-circle-outline" size={64} color="white" />
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity onPress={() => handleLike(item.id, index)} style={styles.actionButton}>
          <Ionicons 
            name={item.is_liked ? "heart" : "heart-outline"} 
            size={26} 
            color={item.is_liked ? "#ff3040" : "#333"} 
          />
          <Text style={[styles.actionText, item.is_liked && {color: '#ff3040'}]}>{item.likes_count}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => router.push(`/comments/${item.id}`)}
        >
          <Ionicons name="chatbubble-outline" size={24} color="#333" />
          <Text style={styles.actionText}>Comment</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.topBar}>
         <Text style={styles.logo}>SocialConnect</Text>
         <TouchableOpacity onPress={() => router.push('/create')}>
            <Ionicons name="add-circle-outline" size={30} color="#000" />
         </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0095f6" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={posts}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchFeed(); }} />
          }
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No posts yet.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  logo: { fontSize: 24, fontWeight: '800', fontStyle: 'italic', color: '#000' },
  card: { marginBottom: 15, borderBottomWidth: 8, borderBottomColor: '#f0f2f5' },
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
  emptyText: { textAlign: 'center', marginTop: 50, color: '#888' }
});