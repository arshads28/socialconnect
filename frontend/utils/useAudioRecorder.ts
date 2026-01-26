import { useState, useRef } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordDuration, setRecordDuration] = useState(0);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startX = useRef(0);
  
  // ✅ FIX 2: Race condition guard for Swipe-to-Cancel
  const cancelledRef = useRef(false);

  const ensureAudioPermission = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  };

  // ✅ CORRECTED AUDIO OPTIONS
const startRecording = async () => {
  cancelledRef.current = false;
  const allowed = await ensureAudioPermission();
  if (!allowed) { Alert.alert("Microphone access required"); return; }

  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  const recording = new Audio.Recording();
  
  await recording.prepareToRecordAsync({
    android: { 
      extension: '.m4a', 
      outputFormat: Audio.AndroidOutputFormat.MPEG_4, 
      audioEncoder: Audio.AndroidAudioEncoder.AAC,   
      numberOfChannels: 1, 
      bitRate: 32000 
    },
    ios: { 
      extension: '.m4a', 
      audioQuality: Audio.IOSAudioQuality.LOW, 
      sampleRate: 22050, 
      numberOfChannels: 1, 
      bitRate: 32000, 
      linearPCMBitDepth: 16, 
      linearPCMIsBigEndian: false, 
      linearPCMIsFloat: false 
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000,
    }
  });

  await recording.startAsync();
  recordingRef.current = recording;
  setIsRecording(true);
  setRecordDuration(0);

  recordTimerRef.current = setInterval(() => {
    setRecordDuration(d => {
      if (d >= 119) { stopRecording(); return 120; }
      return d + 1;
    });
  }, 1000);
};

  const stopRecording = async () => {
    //  If we already cancelled via swipe, ignore the finger release
    if (cancelledRef.current) {
        cancelledRef.current = false;
        return;
    }

    if (!recordingRef.current) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;

    await recordingRef.current.stopAndUnloadAsync();
    const uri = recordingRef.current.getURI();

    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); 

    recordingRef.current = null;
    setIsRecording(false);
    setRecordedUri(uri || null);
  };

  const cancelRecording = async () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;

    try { await recordingRef.current?.stopAndUnloadAsync(); } catch {}
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); 

    recordingRef.current = null;
    setIsRecording(false);
    setRecordedUri(null);
    setRecordDuration(0);
  };

  const onMicPressIn = (e: any) => {
    startX.current = e.nativeEvent.pageX;
    startRecording();
  };

  const onMicMove = (e: any) => {
    if (!isRecording) return;
    const deltaX = startX.current - e.nativeEvent.pageX;
    if (deltaX > 80 && !cancelledRef.current) { 
      cancelledRef.current = true; // Block onPressOut from saving it
      cancelRecording();
    }
  };

  return {
    isRecording,
    recordedUri,
    recordDuration,
    setRecordedUri,
    onMicPressIn,
    onMicMove,
    stopRecording,
    cancelRecording
  };
};