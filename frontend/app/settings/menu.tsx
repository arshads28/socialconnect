import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function MenuScreen() {
  const router = useRouter();

  const MENU_ITEMS = [
    { label: 'Settings and privacy', icon: 'settings-outline', route: '/settings/main' },
    { label: 'Your activity', icon: 'time-outline', route: null },
    { label: 'Saved', icon: 'bookmark-outline', route: null },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        <Text style={styles.title}>Menu</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.list}>
        {MENU_ITEMS.map((item, index) => (
            <TouchableOpacity 
                key={index} 
                style={styles.item}
                onPress={() => item.route && router.push(item.route as any)}
            >
                <Ionicons name={item.icon as any} size={24} color="#000" />
                <Text style={styles.itemText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={20} color="#ccc" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 18, fontWeight: 'bold' },
  list: { padding: 16 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 12 },
  itemText: { fontSize: 16 },
});