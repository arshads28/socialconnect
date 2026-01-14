import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { getSecure } from '../../utils/storage';

export default function HomeScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 1. Initial Check on Load
  useEffect(() => {
    checkTokenAndFetch();
  }, []);

  // 2. Security Check: Do we have a token?
  const checkTokenAndFetch = async () => {
    const token = await getSecure('accessToken');
    
    if (!token) {
      // No token found -> Go to Login immediately
      router.replace('/login');
      return;
    }

    // Token exists -> Fetch data
    fetchFeed();
  };

  // 3. Fetch Data from Django
  const fetchFeed = async () => {
    try {
      const response = await api.get('/api/feed/');
      setPosts(response.data);
    } catch (error) {
      console.log("Error fetching feed:", error);
      
      // If server says "401 Unauthorized", force login
      router.replace('/login');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 4. Handle Like Button
  const handleLike = async (postId: string, index: number) => {
    const newPosts = [...posts];
    const post = newPosts[index];
    const wasLiked = post.is_liked;

    // Optimistic Update (Update UI instantly)
    post.is_liked = !wasLiked;
    post.likes_count = wasLiked ? post.likes_count - 1 : post.likes_count + 1;
    setPosts(newPosts);

    // Send to Server
    try {
      await api.post(`/api/post/${postId}/like/`);
    } catch (error) {
      console.log("Like failed", error);
      // Revert if failed
      post.is_liked = wasLiked; 
      post.likes_count = wasLiked ? post.likes_count : post.likes_count; 
      setPosts([...posts]);
    }
  };

  // 5. Render Each Post Card
  const renderItem = ({ item, index }: { item: any, index: number }) => (
    <View style={styles.card}>
      {/* Header: Avatar + Name */}
      <View style={styles.header}>
        <Image 
          source={{ uri: item.author.avatar || 'https://via.placeholder.com/50' }} 
          style={styles.avatar} 
        />
        <View>
          <Text style={styles.username}>@{item.author.username}</Text>
          <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
        </View>
      </View>

      {/* Post Text */}
      {item.content ? <Text style={styles.content}>{item.content}</Text> : null}

      {/* Post Media (Image) */}
      {item.media && item.media_type === 'image' && (
        <Image 
          source={{ uri: item.media }} 
          style={styles.postImage} 
          resizeMode="cover"
        />
      )}

      {/* Post Media (Video Placeholder) */}
      {item.media && item.media_type === 'video' && (
        <View style={[styles.postImage, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
           <Ionicons name="play-circle-outline" size={64} color="white" />
           <Text style={{color: 'white', marginTop: 10}}>Video</Text>
        </View>
      )}

      {/* Footer: Likes & Comments */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={() => handleLike(item.id, index)} style={styles.actionButton}>
          <Ionicons 
            name={item.is_liked ? "heart" : "heart-outline"} 
            size={24} 
            color={item.is_liked ? "#e91e63" : "#333"} 
          />
          <Text style={styles.actionText}>{item.likes_count} Likes</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="chatbubble-outline" size={22} color="#333" />
          <Text style={styles.actionText}>Comment</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
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
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No posts found.{"\n"}Check back later!
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  card: { backgroundColor: '#fff', marginBottom: 10, paddingBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10, backgroundColor: '#ddd' },
  username: { fontWeight: 'bold', fontSize: 15 },
  date: { color: '#888', fontSize: 11, marginTop: 2 },
  content: { fontSize: 15, paddingHorizontal: 10, marginBottom: 10, lineHeight: 22 },
  postImage: { width: '100%', height: 350, backgroundColor: '#eee' },
  footer: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f0f0f0', marginTop: 5, paddingTop: 10, paddingHorizontal: 10 },
  actionButton: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
  actionText: { marginLeft: 5, fontSize: 14, fontWeight: '500', color: '#555' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#888', lineHeight: 24 }
});