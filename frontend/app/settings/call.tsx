import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const RESOLUTIONS = [
  { label: '360p (Data Saver)', value: '360', width: 480, height: 360, bitrate: 250 },
  { label: '480p (Standard)', value: '480', width: 640, height: 480, bitrate: 500 },
  { label: '720p (HD)', value: '720', width: 1280, height: 720, bitrate: 1500 },
  { label: '1080p (Full HD)', value: '1080', width: 1920, height: 1080, bitrate: 3000 },
];

const FRAME_RATES = [
  { label: '15 FPS (Best for 4G)', value: 15 },
  { label: '20 FPS (Balanced)', value: 20 },
  { label: '24 FPS (Cinema)', value: 24 },
  { label: '30 FPS (Smooth)', value: 30 },
];

export default function CallSettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [resolution, setResolution] = useState('360'); // Default
  const [fps, setFps] = useState(15); // Default

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedRes = await AsyncStorage.getItem('call_resolution');
      const savedFps = await AsyncStorage.getItem('call_fps');
      
      if (savedRes) setResolution(savedRes);
      if (savedFps) setFps(parseInt(savedFps));
    } catch (e) {
      console.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const saveSetting = async (key: string, value: any) => {
    try {
      if (key === 'call_resolution') setResolution(value);
      if (key === 'call_fps') setFps(value);
      await AsyncStorage.setItem(key, String(value));
    } catch (e) {
      console.error("Failed to save setting");
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#0095f6" /></View>;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>Video & Call Quality</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* RESOLUTION SECTION */}
        <Text style={styles.sectionTitle}>Video Resolution</Text>
        <Text style={styles.sectionSubtitle}>Lower resolution saves data and battery.</Text>
        <View style={styles.card}>
          {RESOLUTIONS.map((res) => (
            <TouchableOpacity 
              key={res.value} 
              style={styles.optionRow} 
              onPress={() => saveSetting('call_resolution', res.value)}
            >
              <Text style={styles.optionText}>{res.label}</Text>
              {resolution === res.value && <Ionicons name="checkmark-circle" size={24} color="#0095f6" />}
              {resolution !== res.value && <View style={styles.radioCircle} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* FPS SECTION */}
        <Text style={styles.sectionTitle}>Frame Rate (FPS)</Text>
        <Text style={styles.sectionSubtitle}>Lower FPS helps on slow networks.</Text>
        <View style={styles.card}>
          {FRAME_RATES.map((f) => (
            <TouchableOpacity 
              key={f.value} 
              style={styles.optionRow} 
              onPress={() => saveSetting('call_fps', f.value)}
            >
              <Text style={styles.optionText}>{f.label}</Text>
              {fps === f.value && <Ionicons name="checkmark-circle" size={24} color="#0095f6" />}
              {fps !== f.value && <View style={styles.radioCircle} />}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={24} color="#666" />
          <Text style={styles.infoText}>
            These settings apply to outgoing calls. Incoming video quality depends on the caller's settings.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 18, fontWeight: 'bold' },
  content: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 10, marginBottom: 4, color: '#333' },
  sectionSubtitle: { fontSize: 13, color: '#666', marginBottom: 10 },
  card: { backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden', marginBottom: 20 },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  optionText: { fontSize: 16 },
  radioCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ddd' },
  infoBox: { flexDirection: 'row', backgroundColor: '#eef', padding: 15, borderRadius: 8, gap: 10, alignItems: 'center', marginTop: 10 },
  infoText: { flex: 1, color: '#555', fontSize: 13, lineHeight: 18 },
});