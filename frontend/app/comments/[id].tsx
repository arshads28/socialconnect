import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, 
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';

export default function CommentsScreen() {
  const { id } = useLocalSearchParams(); // This is the Post ID
  const router = useRouter();
  
  const [comments, setComments] = useState<any[]>([]); 
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (id) fetchComments();
  }, [id]);

  const fetchComments = async () => {
    try {
      // ✅ FIX 1: Use Query Parameter for GET
      // Backend expects: /api/comments/?post_id=...
      const response = await api.get(`/api/comments/?post_id=${id}`);
      
      // Handle Django pagination or raw list
      if (Array.isArray(response.data)) {
        setComments(response.data);
      } else if (response.data.results) {
        setComments(response.data.results);
      } else {
        setComments([]);
      }
    } catch (error) {
      console.log("Error loading comments:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePostComment = async () => {
    if (!text.trim()) return;
    setSending(true);

    try {
      // ✅ FIX 2: Post to /api/comments/ and send post_id in the BODY
      const response = await api.post(`/api/comments/`, { 
        post_id: id, 
        content: text 
      });

      // Update UI instantly
      setComments((prev) => {
        const currentList = Array.isArray(prev) ? prev : [];
        return [response.data, ...currentList];
      });

      setText('');
    } catch (error) {
      console.log("Post comment error:", error);
      Alert.alert("Error", "Could not post comment");
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.commentItem}>
      <Text style={styles.username}>@{item.author?.username || 'User'}</Text>
      <Text style={styles.commentText}>{item.content}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Comments</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} color="#0095f6" />
      ) : (
        <FlatList
          data={comments}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No comments yet.</Text>}
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Add a comment..."
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity onPress={handlePostComment} disabled={!text.trim() || sending}>
            {sending ? (
              <ActivityIndicator size="small" color="#0095f6" />
            ) : (
              <Text style={[styles.postText, !text.trim() && { opacity: 0.5 }]}>Post</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  commentItem: { marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap' },
  username: { fontWeight: 'bold', marginRight: 8 },
  commentText: { flex: 1, color: '#333' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 20 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderColor: '#eee' },
  input: { flex: 1, padding: 10, borderRadius: 20, backgroundColor: '#f0f0f0', marginRight: 10, maxHeight: 100 },
  postText: { color: '#0095f6', fontWeight: 'bold' },
});