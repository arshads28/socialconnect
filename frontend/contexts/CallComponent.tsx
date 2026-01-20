import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWebRTC } from './WebRTCContext'; 
// ✅ Import directly from library again
import { RTCView } from 'react-native-webrtc'; 
import { SafeAreaView } from 'react-native-safe-area-context';

export const CallHeaderButton = ({ targetId, isVideo = false }: { targetId: string, isVideo?: boolean }) => {
  const { startCall } = useWebRTC();

  return (
    <TouchableOpacity onPress={() => startCall(targetId, isVideo)} style={{ marginRight: 15 }}>
      <Ionicons name={isVideo ? "videocam-outline" : "call-outline"} size={24} color="#0095f6" />
    </TouchableOpacity>
  );
};

export const CallOverlay = () => {
  const { 
    callState, 
    localStream, 
    remoteStream, 
    callerId,
    endCall, 
    acceptCall,
    toggleMute,
    toggleSpeaker,
    switchCamera,
    isMuted,
    isSpeakerOn,
    isVideoEnabled
  } = useWebRTC();

  if ((callState as string) === 'idle') return null;

  return (
    <Modal 
      visible={(callState as string) !== 'idle'}
      animationType="slide" 
      transparent={false}
      onRequestClose={() => {
        // Handle Android hardware back button if needed
      }}
    >
      <SafeAreaView style={styles.container}>
        
        {/* 1. VIDEO STREAMS */}
        {isVideoEnabled && (
          <View style={styles.videoContainer}>
            {/* Remote Stream (Full Screen) */}
            {remoteStream && (
              <RTCView
                streamURL={remoteStream.toURL()}
                style={styles.remoteVideo}
                objectFit="cover"
              />
            )}
            {/* Local Stream (Picture in Picture) */}
            {localStream && (
              <View style={styles.localVideoWrapper}>
                <RTCView
                  streamURL={localStream.toURL()}
                  style={styles.localVideo}
                  objectFit="cover"
                  zOrder={1} // Important for Android overlay
                />
              </View>
            )}
          </View>
        )}

        {/* 2. CALL INFO (Audio Only) */}
        {!isVideoEnabled && (
          <View style={styles.infoContainer}>
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={50} color="#fff" />
            </View>
            <Text style={styles.callerName}>{callerId || 'Unknown Caller'}</Text>
            <Text style={styles.callStatus}>
              {callState === 'calling' ? 'Calling...' : 
               callState === 'ringing' ? 'Incoming Call...' : 
               callState === 'connected' ? 'Connected' : 'Connecting...'}
            </Text>
          </View>
        )}

        {/* 3. CONTROLS */}
        <View style={styles.controlsContainer}>
          
          {/* INCOMING CALL ACTIONS */}
          {callState === 'ringing' ? (
            <View style={styles.incomingControls}>
              <TouchableOpacity style={[styles.btn, styles.btnReject]} onPress={endCall}>
                <Ionicons name="close" size={32} color="#fff" />
                <Text style={styles.btnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnAccept]} onPress={() => acceptCall()}>
                <Ionicons name="call" size={32} color="#fff" />
                <Text style={styles.btnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          ) : (
            
            /* ACTIVE CALL ACTIONS */
            <View style={styles.activeControls}>
              <TouchableOpacity style={[styles.controlBtn, isMuted && styles.activeState]} onPress={toggleMute}>
                <Ionicons name={isMuted ? "mic-off" : "mic"} size={28} color={isMuted ? "#000" : "#fff"} />
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.controlBtn, isSpeakerOn && styles.activeState]} onPress={toggleSpeaker}>
                <Ionicons name={isSpeakerOn ? "volume-high" : "volume-mute"} size={28} color={isSpeakerOn ? "#000" : "#fff"} />
              </TouchableOpacity>

              {isVideoEnabled && (
                <TouchableOpacity style={styles.controlBtn} onPress={switchCamera}>
                  <Ionicons name="camera-reverse" size={28} color="#fff" />
                </TouchableOpacity>
              )}

              <TouchableOpacity style={[styles.controlBtn, styles.btnEnd]} onPress={endCall}>
                <Ionicons name="call" size={32} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#222' },
  videoContainer: { flex: 1, position: 'relative' },
  remoteVideo: { flex: 1, backgroundColor: '#000' },
  localVideoWrapper: {
    position: 'absolute', top: 20, right: 20, 
    width: 100, height: 150,
    borderRadius: 10, overflow: 'hidden',
    borderWidth: 2, borderColor: '#fff', elevation: 5
  },
  localVideo: { flex: 1 },
  infoContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#555', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  callerName: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  callStatus: { fontSize: 16, color: '#aaa' },
  controlsContainer: { paddingBottom: 30, paddingTop: 20, alignItems: 'center' },
  incomingControls: { flexDirection: 'row', width: '80%', justifyContent: 'space-between' },
  activeControls: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  btn: { alignItems: 'center', justifyContent: 'center' },
  btnReject: { backgroundColor: '#ff3b30', width: 70, height: 70, borderRadius: 35 },
  btnAccept: { backgroundColor: '#4cd964', width: 70, height: 70, borderRadius: 35 },
  btnText: { color: '#fff', marginTop: 8, fontSize: 14 },
  controlBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  activeState: { backgroundColor: '#fff' },
  btnEnd: { backgroundColor: '#ff3b30' },
});