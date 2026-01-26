import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; // Import this
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { purgeOldMessages } from '../../utils/db'; // Import your DB purge function

const RETENTION_KEY = 'connect_retention_days';

export default function SettingsScreen() {
  const router = useRouter();
  const { isDark, theme, setTheme } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;
  
  // Default to 90 days if not set
  const [retentionDays, setRetentionDays] = useState<number>(90);

  useEffect(() => {
    loadRetentionSettings();
  }, []);

  const loadRetentionSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(RETENTION_KEY);
      if (stored) {
        setRetentionDays(parseInt(stored, 10));
      } else {
        // Set default 90 days if brand new install
        await AsyncStorage.setItem(RETENTION_KEY, '90');
      }
    } catch (e) { console.log("Failed to load retention settings", e); }
  };

  const handleRetentionChange = () => {
    Alert.alert(
      "Auto-Delete Messages", 
      "Delete messages older than...", 
      [
        { text: "30 Days", onPress: () => saveRetention(30) },
        { text: "90 Days (Recommended)", onPress: () => saveRetention(90) },
        { text: "180 Days", onPress: () => saveRetention(180) },
        { text: "1 Year", onPress: () => saveRetention(365) },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const saveRetention = async (days: number) => {
    try {
      await AsyncStorage.setItem(RETENTION_KEY, String(days));
      setRetentionDays(days);
      
      // ✅ IMMEDIATELY APPLY: Run the purge now so the user sees the effect
      purgeOldMessages(days);
      
      Alert.alert("Success", `Messages older than ${days} days have been cleared.`);
    } catch (e) {
      Alert.alert("Error", "Could not save setting.");
    }
  };

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
        
        {/* APPEARANCE */}
        <Text style={[styles.sectionTitle, { color: colors.subText }]}>Appearance</Text>
        <TouchableOpacity style={styles.item} onPress={handleThemeChange}>
            <Ionicons name={isDark ? "moon-outline" : "sunny-outline"} size={24} color={colors.icon} />
            <Text style={[styles.itemText, { color: colors.text }]}>App Theme</Text>
            <Text style={{ color: colors.subText, marginLeft: 'auto', marginRight: 8 }}>{getThemeLabel()}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.subText} />
        </TouchableOpacity>

        {/* PRIVACY & STORAGE (NEW SECTION) */}
        <Text style={[styles.sectionTitle, { color: colors.subText }]}>Privacy & Storage</Text>
        
        <TouchableOpacity style={styles.item} onPress={handleRetentionChange}>
            <Ionicons name="timer-outline" size={24} color={colors.icon} />
            <Text style={[styles.itemText, { color: colors.text }]}>Auto-Delete Messages</Text>
            <Text style={{ color: colors.subText, marginLeft: 'auto', marginRight: 8 }}>
                {retentionDays} Days
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.subText} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.item} onPress={() => router.push('/settings/blocked')}>
             <Ionicons name="ban-outline" size={24} color={colors.icon} />
             <Text style={[styles.itemText, { color: colors.text }]}>Blocked Users</Text>
             <Ionicons name="chevron-forward" size={20} color={colors.subText} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {/* OTHER SETTINGS */}
        <Text style={[styles.sectionTitle, { color: colors.subText }]}>App Settings</Text>
        <TouchableOpacity style={styles.item} onPress={() => router.push('/settings/call')}>
            <Ionicons name="call-outline" size={24} color={colors.icon} />
            <Text style={[styles.itemText, { color: colors.text }]}>Call & Video Settings</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.subText} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
  
  // ... (keep handleThemeChange helper defined above or inside component)
  function handleThemeChange() {
    Alert.alert("Choose Appearance", "Select your preferred theme", [
      { text: "System Default", onPress: () => setTheme('system') },
      { text: "Light Mode", onPress: () => setTheme('light') },
      { text: "Dark Mode", onPress: () => setTheme('dark') },
      { text: "Cancel", style: "cancel" }
    ]);
  }
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