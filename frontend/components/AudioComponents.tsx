import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';

// Global Lock
let activeSound: Audio.Sound | null = null;

export const WaveformLive = React.memo(function WaveformLive({ active, color }: { active: boolean, color: string }) {
  const heights = useRef(Array.from({ length: 15 }, () => new Animated.Value(4))).current;
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
});

// ✅ MEMOIZED: Prevents re-renders from killing audio when message status updates
export const AudioPlayerBubble = React.memo(function AudioPlayerBubble({ uri, isMe, colors }: { uri: string, isMe: boolean, colors: any }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const soundRef = useRef<Audio.Sound | null>(null);
  
  const waveformHeights = useMemo(() => Array.from({ length: 25 }, () => 6 + Math.random() * 12), []);

  const togglePlayback = async () => {
    try {
      if (isPlaying) {
        if (soundRef.current) await soundRef.current.pauseAsync();
        setIsPlaying(false);
        return;
      }

      if (activeSound && activeSound !== soundRef.current) {
        await activeSound.stopAsync();
      }

      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
        
        // ✅ Explicitly disable looping
        const { sound } = await Audio.Sound.createAsync(
          { uri }, 
          { shouldPlay: true, rate, isLooping: false } 
        );
        
        soundRef.current = sound;
        activeSound = sound;

        sound.setOnPlaybackStatusUpdate(async (status: any) => {
          if (!status.isLoaded) return;

          // ✅ FORCE STOP when finished to prevent background zombie audio
          if (status.didJustFinish) {
            setIsPlaying(false);
            if (soundRef.current) {
                try {
                    await soundRef.current.stopAsync();
                    await soundRef.current.setPositionAsync(0);
                } catch(e) {}
            }
            if (activeSound === sound) activeSound = null;
          }
        });

        setIsPlaying(true);
      } else {
        activeSound = soundRef.current;
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.log("Playback error", error);
      setIsPlaying(false);
    }
  };

  const toggleSpeed = () => {
    const nextRate = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(nextRate);
    if (soundRef.current) {
      soundRef.current.setRateAsync(nextRate, true);
    }
  };

  useEffect(() => {
    return () => { 
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        if (activeSound === soundRef.current) activeSound = null;
      }
    }; 
  }, []);

  return (
    <View style={styles.audioPlayerContainer}>
      <TouchableOpacity 
        onPress={togglePlayback} 
        style={[styles.playButton, { backgroundColor: isMe ? '#fff' : colors.tint }]}
      >
        <Ionicons 
          name={isPlaying ? "pause" : "play"} 
          size={20} 
          color={isMe ? colors.tint : '#fff'} 
          style={{ marginLeft: isPlaying ? 0 : 2 }} 
        />
      </TouchableOpacity>

      <View style={styles.fakeWaveform}>
        {waveformHeights.map((height, i) => (
          <View 
            key={i} 
            style={[styles.staticBar, { 
                height, 
                backgroundColor: isMe ? 'rgba(255,255,255,0.7)' : colors.tint,
                opacity: isPlaying ? 1.0 : 0.6 
            }]} 
          />
        ))}
      </View>

      <TouchableOpacity onPress={toggleSpeed} style={styles.speedButton}>
        <Text style={[styles.speedText, { color: isMe ? '#fff' : colors.text }]}>{rate}x</Text>
      </TouchableOpacity>
    </View>
  );
}, (prev, next) => {
  // ✅ CUSTOM COMPARATOR: Only re-render if URI effectively changes or Theme changes
  // Ignore 'isMe' changes if they don't affect layout
  return prev.uri === next.uri && prev.colors.tint === next.colors.tint;
});

const styles = StyleSheet.create({
  audioPlayerContainer: { flexDirection: 'row', alignItems: 'center', minWidth: 200, paddingVertical: 4 },
  playButton: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  fakeWaveform: { flexDirection: 'row', alignItems: 'center', flex: 1, height: 30, gap: 2 },
  staticBar: { width: 3, borderRadius: 2, marginHorizontal: 0.5 },
  speedButton: { paddingHorizontal: 8, paddingVertical: 4, marginLeft: 6, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.1)' },
  speedText: { fontWeight: 'bold', fontSize: 12 }
});