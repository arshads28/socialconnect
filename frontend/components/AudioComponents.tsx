import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';

// FIX 3: Global Audio Singleton Lock
let activeSound: Audio.Sound | null = null;

export function WaveformLive({ active, color }: { active: boolean, color: string }) {
  const heights = useRef(Array.from({ length: 15 }, () => new Animated.Value(4))).current;
  
  //FIX 1: Guard against rapid active toggles restacking animations
  const running = useRef(false); 

  useEffect(() => {
    if (!active || running.current) return;
    running.current = true;
    
    const animations = heights.map(height =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(height, { toValue: 8 + Math.random() * 12, duration: 250, useNativeDriver: false }),
          Animated.timing(height, { toValue: 4, duration: 250, useNativeDriver: false }),
        ])
      )
    );
    animations.forEach(anim => anim.start());

    return () => {
      animations.forEach(anim => anim.stop());
      running.current = false;
    };
  }, [active]);

  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', height: 24 }}>
      {heights.map((height, i) => (
        <Animated.View key={i} style={{ width: 3, borderRadius: 2, backgroundColor: color, height }} />
      ))}
    </View>
  );
}

export function AudioPlayerBubble({ uri, isMe, colors }: { uri: string, isMe: boolean, colors: any }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const soundRef = useRef<Audio.Sound | null>(null);
  const waveformHeights = useMemo(() => Array.from({ length: 20 }, () => 4 + Math.random() * 10), []);

  const togglePlayback = async () => {
    if (isPlaying) {
      await soundRef.current?.pauseAsync();
      setIsPlaying(false);
    } else {
      // FIX 3: Stop currently playing sound elsewhere in the list
      if (activeSound && activeSound !== soundRef.current) {
        await activeSound.stopAsync();
      }

      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true, rate });
        soundRef.current = sound;
        activeSound = sound; // Claim global lock

        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.didJustFinish) {
            setIsPlaying(false);
            sound.setPositionAsync(0);
          }
        });
      } else {
        activeSound = soundRef.current; // Re-claim global lock
        await soundRef.current.playAsync();
      }
      setIsPlaying(true);
    }
  };

  const toggleSpeed = () => {
    const nextRate = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(nextRate);
    soundRef.current?.setRateAsync(nextRate, true);
  };

  useEffect(() => {
    return () => { 
      if (soundRef.current === activeSound) activeSound = null;
      soundRef.current?.unloadAsync(); 
    }; 
  }, []);

  return (
    <View style={styles.audioPlayerContainer}>
      <TouchableOpacity onPress={togglePlayback} style={[styles.playButton, { backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : colors.tint }]}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={16} color="#fff" />
      </TouchableOpacity>
      <View style={styles.fakeWaveform}>
        {waveformHeights.map((height, i) => (
          <View key={i} style={[styles.staticBar, { height, backgroundColor: isMe ? '#fff' : colors.tint }]} />
        ))}
      </View>
      <TouchableOpacity onPress={toggleSpeed} style={styles.speedButton}>
        <Text style={[styles.speedText, { color: isMe ? '#fff' : colors.tint }]}>{rate}x</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  audioPlayerContainer: { flexDirection: 'row', alignItems: 'center', minWidth: 200, paddingVertical: 4 },
  playButton: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  fakeWaveform: { flexDirection: 'row', alignItems: 'center', flex: 1, height: 30, gap: 2 },
  staticBar: { width: 3, borderRadius: 2 },
  speedButton: { paddingHorizontal: 8, paddingVertical: 4, marginLeft: 6, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.1)' },
  speedText: { fontWeight: 'bold', fontSize: 12 }
});