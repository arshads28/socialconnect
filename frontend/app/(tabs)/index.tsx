import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router'; 
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext'; 

export default function HomeScreen() {
  const router = useRouter();
  const { signOut } = useAuth(); 
  
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Pagination State
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchFeed();
  }, []);

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
      
      if (error.response?.status === 401) {
        signOut(); 
      } 
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

    // Optimistic Update
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
      {/* Header */}
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

      {/* Content */}
      {item.content ? <Text style={styles.content}>{item.content}</Text> : null}

      {/* Media */}
      {item.media && (
        item.media_type === 'video' ? (
           <View style={styles.videoPlaceholder}>
              <Ionicons name="play-circle-outline" size={64} color="white" />
           </View>
        ) : (
           <Image source={{ uri: item.media }} style={styles.postImage} resizeMode="cover"/>
        )
      )}

      {/* Footer */}
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
      
      {/* UPDATED TOP BAR */}
      <View style={styles.topBar}>
         <Text style={styles.logo}>SocialConnect</Text>
         
         <View style={{ flexDirection: 'row', gap: 15 }}>
             {/* 1. Search Icon -> Goes to Explore Tab */}
             <TouchableOpacity onPress={() => router.push('/(tabs)/explore')}>
                <Ionicons name="search-outline" size={26} color="#000" />
             </TouchableOpacity>

             {/* 2. Create Post Icon */}
             <TouchableOpacity onPress={() => router.push('/create')}>
                <Ionicons name="add-circle-outline" size={30} color="#000" />
             </TouchableOpacity>
         </View>
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
          onEndReached={fetchMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator size="small" color="#0095f6" style={{ margin: 20 }} /> : null
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