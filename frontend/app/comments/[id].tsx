import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, 
  StyleSheet, ActivityIndicator, Alert, Platform, Modal,Keyboard
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import KeyboardWrapper from '../../components/KeyboardWrapper'; 

// Theme Imports
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';

export default function CommentsScreen() {
  const { id } = useLocalSearchParams(); 
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  // Theme Setup
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

  const [comments, setComments] = useState<any[]>([]); 
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [postAuthorId, setPostAuthorId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState<number | null>(null);

  // Track if keyboard is visible
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Constants
  const HEADER_HEIGHT = 60;

  useEffect(() => {
    if (id) {
      fetchComments();
      fetchCurrentUser();
    }
  }, [id]);

  const fetchCurrentUser = async () => {
    try {
      const response = await api.get('/auth/api/profile/me');
      const userId = response.data.id || response.data.pk;
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
        if (response.data.length > 0) setPostAuthorId(response.data[0].post_author_id);
      } else if (response.data.results) {
        setComments(response.data.results);
        if (response.data.results.length > 0) setPostAuthorId(response.data.results[0].post_author_id);
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
      const response = await api.post(`/api/comments/`, { 
        post_id: id, 
        content: text 
      });

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
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this comment?')) {
        try {
          await api.delete(`/api/comments/${commentId}/`);
          setComments(comments.filter(c => c.id !== commentId));
        } catch (error) {
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
              try {
                await api.delete(`/api/comments/${commentId}/`);
                setComments(comments.filter(c => c.id !== commentId));
              } catch (error) {
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
          <Text style={[styles.username, { color: colors.text }]}>@{item.author?.username || 'User'}</Text>
          <Text style={[styles.commentText, { color: colors.text }]}>{item.content}</Text>
        </View>
        {canDelete && (
          <TouchableOpacity 
            onPress={() => setMenuVisible(item.id)} 
            style={styles.menuBtn}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.subText} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      
      <View style={[styles.header, { borderColor: colors.border, height: HEADER_HEIGHT }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.icon} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Comments</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardWrapper headerHeight={HEADER_HEIGHT}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 20 }} color={colors.tint} />
        ) : (
          <FlatList
            data={comments}
            renderItem={renderItem}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={{ padding: 16 }}
            ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.subText }]}>No comments yet.</Text>}
            keyboardDismissMode="interactive"
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }} 
          />
        )}

        <View style={[styles.inputContainer, { 
          backgroundColor: colors.background, 
          borderColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 12)
        }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text }]}
            placeholder="Add a comment..."
            placeholderTextColor={colors.subText}
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="center"
          />
          <TouchableOpacity onPress={handlePostComment} disabled={!text.trim() || sending} style={{ padding: 8 }}>
            {sending ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : (
              <Text style={[styles.postText, { color: colors.tint }, !text.trim() && { opacity: 0.5 }]}>Post</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardWrapper>

      {/* Dropdown Menu Modal */}
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
              style={[styles.menuModalComment, { backgroundColor: colors.card }]}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              <TouchableOpacity 
                style={styles.menuOption} 
                onPress={() => {
                  const commentId = menuVisible;
                  setMenuVisible(null);
                  if (commentId) setTimeout(() => handleDeleteComment(commentId), 100);
                }}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={[styles.menuOptionTextDelete, { color: colors.danger }]}>Delete</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  commentItem: { marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingRight: 8 },
  username: { fontWeight: 'bold', marginBottom: 4, fontSize: 14 },
  commentText: { fontSize: 14, lineHeight: 20 },
  menuBtn: { padding: 8, marginLeft: 8 },
  emptyText: { textAlign: 'center', marginTop: 20 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1 },
  input: { flex: 1, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 12 : 10, paddingBottom: Platform.OS === 'ios' ? 12 : 10, borderRadius: 20, marginRight: 10, maxHeight: 100 },
  postText: { fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  menuModalComment: { borderRadius: 8, width: 150, position: 'absolute', top: 100, right: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  menuOption: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  menuOptionTextDelete: { fontSize: 16, fontWeight: '500' },
});