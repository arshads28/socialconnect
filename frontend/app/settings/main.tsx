import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Log Out", style: "destructive", onPress: signOut }
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        <Text style={styles.title}>Settings and privacy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>App Settings</Text>
        
        <TouchableOpacity style={styles.item} onPress={() => router.push('/settings/call')}>
            <Ionicons name="call-outline" size={24} color="#000" />
            <Text style={styles.itemText}>Call & Video Settings</Text>
            <Ionicons name="chevron-forward" size={20} color="#ccc" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.item} onPress={() => router.push('/settings/blocked')}>
             <Ionicons name="ban-outline" size={24} color="#000" />
             <Text style={styles.itemText}>Blocked Users</Text>
             <Ionicons name="chevron-forward" size={20} color="#ccc" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Login</Text>
        
        <TouchableOpacity style={styles.item} onPress={handleLogout}>
            <Text style={[styles.itemText, { color: '#ff3b30' }]}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 18, fontWeight: 'bold' },
  content: { padding: 16 },
  sectionTitle: { fontSize: 12, color: '#666', fontWeight: 'bold', marginTop: 20, marginBottom: 10, textTransform: 'uppercase' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  itemText: { fontSize: 16 },
});