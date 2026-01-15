import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, 
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Modal
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [postAuthorId, setPostAuthorId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState<number | null>(null);

  useEffect(() => {
    if (id) {
      fetchComments();
      fetchCurrentUser();
    }
  }, [id]);

  const fetchCurrentUser = async () => {
    try {
      const response = await api.get('/auth/api/me/');
      console.log('Current user data:', response.data);
      // The response might have 'id' or 'pk' field
      const userId = response.data.id || response.data.pk;
      console.log('Setting current user ID:', userId);
      setCurrentUserId(userId);
    } catch (error) {
      console.log('Error fetching user:', error);
    }
  };

  const fetchComments = async () => {
    try {
      const response = await api.get(`/api/comments/?post_id=${id}`);
      
      if (Array.isArray(response.data)) {
        setComments(response.data);
        if (response.data.length > 0) {
          setPostAuthorId(response.data[0].post_author_id);
        }
      } else if (response.data.results) {
        setComments(response.data.results);
        if (response.data.results.length > 0) {
          setPostAuthorId(response.data.results[0].post_author_id);
        }
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

  const handleDeleteComment = async (commentId: number) => {
    console.log('Delete comment clicked:', commentId);
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this comment?')) {
        console.log('Deleting comment:', commentId);
        try {
          await api.delete(`/api/comments/${commentId}/`);
          setComments(comments.filter(c => c.id !== commentId));
          console.log('Comment deleted successfully');
        } catch (error) {
          console.error('Delete error:', error);
          alert('Could not delete comment');
        }
      }
    } else {
      Alert.alert(
        'Delete Comment',
        'Are you sure you want to delete this comment?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              console.log('Deleting comment:', commentId);
              try {
                await api.delete(`/api/comments/${commentId}/`);
                setComments(comments.filter(c => c.id !== commentId));
                console.log('Comment deleted successfully');
              } catch (error) {
                console.error('Delete error:', error);
                Alert.alert('Error', 'Could not delete comment');
              }
            },
          },
        ]
      );
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const canDelete = currentUserId === item.author?.id || currentUserId === postAuthorId;
    
    return (
      <View style={styles.commentItem}>
        <View style={{ flex: 1 }}>
          <Text style={styles.username}>@{item.author?.username || 'User'}</Text>
          <Text style={styles.commentText}>{item.content}</Text>
        </View>
        {canDelete && (
          <TouchableOpacity 
            onPress={() => setMenuVisible(item.id)} 
            style={styles.menuBtn}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

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

      {/* Delete Menu Modal */}
      {menuVisible !== null && (
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
              style={styles.menuModalComment}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              <TouchableOpacity 
                style={styles.menuOption} 
                onPress={() => {
                  console.log('Delete button pressed for comment:', menuVisible);
                  const commentId = menuVisible;
                  setMenuVisible(null);
                  if (commentId) setTimeout(() => handleDeleteComment(commentId), 100);
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#ff3b30" />
                <Text style={styles.menuOptionTextDelete}>Delete</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  commentItem: { marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingRight: 8 },
  username: { fontWeight: 'bold', marginBottom: 4, fontSize: 14 },
  commentText: { color: '#333', fontSize: 14, lineHeight: 20 },
  menuBtn: { padding: 8, marginLeft: 8 },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 20 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderColor: '#eee' },
  input: { flex: 1, padding: 10, borderRadius: 20, backgroundColor: '#f0f0f0', marginRight: 10, maxHeight: 100 },
  postText: { color: '#0095f6', fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  menuModalComment: { backgroundColor: '#fff', borderRadius: 8, width: 150, position: 'absolute', top: 100, right: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  menuOption: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  menuOptionTextDelete: { fontSize: 16, color: '#ff3b30', fontWeight: '500' },
});