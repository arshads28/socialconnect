import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';

export default function MenuScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;
  
  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Log Out", style: "destructive", onPress: signOut }
    ]);
  };

  const MENU_ITEMS = [
    { label: 'Settings and privacy', icon: 'settings-outline', route: '/settings/main' },
    { label: 'Your activity', icon: 'time-outline', route: null },
    { label: 'Saved', icon: 'bookmark-outline', route: null },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.icon} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Menu</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.list}>
        {MENU_ITEMS.map((item, index) => (
            <TouchableOpacity 
                key={index} 
                style={styles.item}
                onPress={() => item.route && router.push(item.route as any)}
            >
                <Ionicons name={item.icon as any} size={24} color={colors.icon} />
                <Text style={[styles.itemText, { color: colors.text }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.subText} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.subText }]}>Login</Text>
        <TouchableOpacity style={styles.item} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color={colors.danger} />
            <Text style={[styles.itemText, { color: colors.danger }]}>Log Out</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: 'bold' },
  list: { padding: 16 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', marginTop: 20, marginBottom: 10, textTransform: 'uppercase' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 12 },
  itemText: { fontSize: 16 },
});