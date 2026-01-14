import { useEffect, useState } from 'react';
import { 
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, 
  KeyboardAvoidingView, Platform, Image, Alert, ActivityIndicator 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';

export default function CommentsScreen() {
  const { id } = useLocalSearchParams(); 
  const router = useRouter();
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchComments();
  }, [id]);

  const fetchComments = async () => {
    try {
      const response = await api.get(`/api/comments/?post_id=${id}`);
      setComments(response.data);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const response = await api.post('/api/comments/', { post_id: id, content: text });
      setComments((prev) => [...prev, response.data]);
      setText('');
    } catch (error) {
      Alert.alert("Error", "Could not post comment");
    } finally {
        setSending(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    Alert.alert("Delete", "Are you sure?", [
        { text: "Cancel" },
        { text: "Delete", style: 'destructive', onPress: async () => {
            try {
                await api.delete(`/api/comments/${commentId}/`);
                setComments(comments.filter(c => c.id !== commentId));
            } catch (err) {
                Alert.alert("Error", "Permission denied");
            }
        }}
    ]);
  };

  const renderComment = ({ item }: { item: any }) => (
    <View style={styles.commentRow}>
      <Image source={{ uri: item.author.avatar || 'https://via.placeholder.com/40' }} style={styles.avatar} />
      <View style={styles.commentContent}>
        <View style={styles.bubble}>
            <Text style={styles.username}>{item.author.username}</Text>
            <Text style={styles.commentText}>{item.content}</Text>
        </View>
        <Text style={styles.timestamp}>Just now</Text> 
      </View>
      {item.is_owner && (
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
             <Ionicons name="trash-outline" size={16} color="#aaa" />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="black" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Comments</Text>
            <View style={{width: 24}}/>
        </View>

        {loading ? (
            <ActivityIndicator style={{marginTop: 20}} />
        ) : (
            <FlatList
                data={comments}
                renderItem={renderComment}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
                ListEmptyComponent={<Text style={styles.empty}>No comments yet.</Text>}
            />
        )}

        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
            <View style={styles.inputBar}>
                <TextInput 
                    style={styles.input} 
                    placeholder="Add a comment..." 
                    value={text}
                    onChangeText={setText}
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                />
                <TouchableOpacity onPress={handleSend} disabled={sending}>
                    <Text style={styles.sendBtn}>Post</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle: { fontWeight: '700', fontSize: 16 },
  commentRow: { flexDirection: 'row', marginBottom: 15 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  commentContent: { flex: 1 },
  bubble: { backgroundColor: '#f0f2f5', borderRadius: 12, padding: 10, alignSelf: 'flex-start' },
  username: { fontWeight: '700', fontSize: 13, marginBottom: 2 },
  commentText: { fontSize: 14, color: '#333' },
  timestamp: { fontSize: 11, color: '#999', marginTop: 4, marginLeft: 5 },
  deleteBtn: { padding: 10 },
  empty: { textAlign: 'center', marginTop: 20, color: '#999' },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#fff' },
  input: { flex: 1, height: 40, backgroundColor: '#f0f2f5', borderRadius: 20, paddingHorizontal: 15 },
  sendBtn: { marginLeft: 10, color: '#0095f6', fontWeight: 'bold' }
});