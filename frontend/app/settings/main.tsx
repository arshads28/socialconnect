import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';

export default function SettingsScreen() {
  const router = useRouter();
  const { isDark, theme, setTheme } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

  const handleThemeChange = () => {
    Alert.alert("Choose Appearance", "Select your preferred theme", [
      { text: "System Default", onPress: () => setTheme('system') },
      { text: "Light Mode", onPress: () => setTheme('light') },
      { text: "Dark Mode", onPress: () => setTheme('dark') },
      { text: "Cancel", style: "cancel" }
    ]);
  };

  // Helper function to capitalize theme name
  const getThemeLabel = () => theme.charAt(0).toUpperCase() + theme.slice(1);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.icon} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Settings and privacy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        
        {/* --- ADDED: THEME SETTINGS --- */}
        <Text style={[styles.sectionTitle, { color: colors.subText }]}>Appearance</Text>
        <TouchableOpacity style={styles.item} onPress={handleThemeChange}>
            <Ionicons name={isDark ? "moon-outline" : "sunny-outline"} size={24} color={colors.icon} />
            <Text style={[styles.itemText, { color: colors.text }]}>App Theme</Text>
            <Text style={{ color: colors.subText, marginLeft: 'auto', marginRight: 8 }}>{getThemeLabel()}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.subText} />
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { color: colors.subText }]}>App Settings</Text>
        
        <TouchableOpacity style={styles.item} onPress={() => router.push('/settings/call')}>
            <Ionicons name="call-outline" size={24} color={colors.icon} />
            <Text style={[styles.itemText, { color: colors.text }]}>Call & Video Settings</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.subText} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.item} onPress={() => router.push('/settings/blocked')}>
             <Ionicons name="ban-outline" size={24} color={colors.icon} />
             <Text style={[styles.itemText, { color: colors.text }]}>Blocked Users</Text>
             <Ionicons name="chevron-forward" size={20} color={colors.subText} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: 'bold' },
  content: { padding: 16 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', marginTop: 20, marginBottom: 10, textTransform: 'uppercase' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  itemText: { fontSize: 16 },
});