import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  FlatList, 
  Image, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Platform,
  Alert 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api'; 
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';

export default function ExploreScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimeout = useRef<any>(null);

  // ---------------------------------------------------------
  // 1. LIVE SEARCH FUNCTION
  // ---------------------------------------------------------
  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    if (query.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    debounceTimeout.current = setTimeout(() => {
      fetchUsers(query);
    }, 500);

    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, [query]);

  const fetchUsers = async (searchQuery: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/chat/search/', {
        params: { q: searchQuery }
      });

      if (response.data.results) {
        setResults(response.data.results);
      } else {
        setResults([]);
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError("You are searching too fast. Slow down.");
      } else {
        console.log("Search Error:", err);
        setError("Could not search users.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // 2. RENDER ROW
  // ---------------------------------------------------------
  const renderItem = ({ item }: { item: any }) => (
    <View style={[styles.userRow, { borderBottomColor: colors.border }]}>
      <TouchableOpacity 
        style={styles.profileLink} 
        onPress={() => router.push(`/profile/${item.username}`)} 
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
             <Ionicons name="person" size={20} color={colors.subText} />
          </View>
        )}
        
        <View style={styles.userInfo}>
          <Text style={[styles.username, { color: colors.text }]}>{item.username}</Text>
          <Text style={[styles.bio, { color: colors.subText }]} numberOfLines={1}>{item.bio || "Connect User"}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.chatBtn, { backgroundColor: colors.card }]}
        onPress={() => router.push(`/chat/${item.username}`)} 
      >
        <Text style={[styles.chatBtnText, { color: colors.text }]}>Chat</Text>
      </TouchableOpacity>
    </View>
  );

  // ---------------------------------------------------------
  // 3. MAIN RETURN
  // ---------------------------------------------------------
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      
      {/* Search Header */}
      <View style={[styles.searchHeader, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchBarWrapper, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={20} color={colors.subText} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search people..."
            placeholderTextColor={colors.subText}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.subText} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results List */}
      <View style={styles.resultsContainer}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color={colors.tint} />
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            renderItem={renderItem}
            keyExtractor={(item) => item.id.toString()}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.centerContainer}>
                <Text style={[styles.emptyText, { color: colors.subText }]}>
                  {query.length < 2 ? "Type to find friends..." : "No users found."}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    paddingTop: Platform.OS === 'android' ? 10 : 0 
  },
  searchHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 50,
    paddingHorizontal: 16,
    height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  resultsContainer: { flex: 1 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1, 
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userInfo: { flex: 1 },
  username: {
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 2,
  },
  bio: {
    fontSize: 13,
  },
  chatBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginLeft: 10,
  },
  chatBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  centerContainer: {
    paddingTop: 50,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  errorText: {
    fontSize: 14,
  }
});