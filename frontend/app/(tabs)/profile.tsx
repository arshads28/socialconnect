import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext'; // Import your new Auth Hook

export default function ProfileScreen() {
  const { signOut } = useAuth(); // Get the signOut function

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.username}>My Profile</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.text}>Profile Content Goes Here</Text>
        
        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 20, borderBottomWidth: 1, borderColor: '#eee' },
  username: { fontSize: 24, fontWeight: 'bold' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 16, color: '#666', marginBottom: 20 },
  logoutBtn: { backgroundColor: '#ff3b30', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 8 },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});