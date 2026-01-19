import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Platform, Alert, AppState,PermissionsAndroid } from 'react-native';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import RNCallKeep from 'react-native-callkeep';
import InCallManager from 'react-native-incall-manager';
import { useWebSocket } from './WebSocketContext';
import { useAuth } from '../context/AuthContext';
import { generateUUID } from '../utils/db';
import { checkCallPermissions } from '../utils/webrtcPermissions';

// 🛠 PRODUCTION CONFIG WITH TURN
const PEER_CONNECTION_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80?transport=udp', 
        'turn:openrelay.metered.ca:443?transport=tcp' 
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10,
};

// 🚦 STATE MACHINE
export type CallState = 
  | 'idle' 
  | 'calling'      // I am calling someone
  | 'ringing'      // Someone is calling me
  | 'connecting'   // We accepted, negotiating connection
  | 'connected'    // Media is flowing
  | 'ending';      // Cleanup in progress

interface WebRTCContextType {
  callState: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callerId: string | null;
  isMuted: boolean;
  isSpeakerOn: boolean;
  isVideoEnabled: boolean;
  startCall: (targetId: string, isVideo?: boolean) => void;
  acceptCall: (uuid?: string) => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleVideo: () => void;
  switchCamera: () => void;
}

const WebRTCContext = createContext<WebRTCContextType | null>(null);

export const useWebRTC = () => {
  const context = useContext(WebRTCContext);
  if (!context) throw new Error('useWebRTC must be used within a WebRTCProvider');
  return context;
};

export const WebRTCProvider = ({ children }: { children: React.ReactNode }) => {
  const { ws } = useWebSocket();
  const { user } = useAuth();

  // 📡 STATE
  const [callState, setCallState] = useState<CallState>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callerId, setCallerId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);

  // 🔒 REFS
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const targetUserId = useRef<string | null>(null);
  const currentCallUUID = useRef<string | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidate[]>([]); // 🧊 ICE QUEUE
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null); // ⏱ TIMEOUT

  // ============================================================
  // 1️⃣ INITIAL SETUP & RECOVERY
  // ============================================================
  useEffect(() => {
    const init = async () => {
      await setupCallKeep();
      
      // 🔄 APP KILL RECOVERY
      // Check if the app was opened by answering a call UI while killed
      if (Platform.OS !== 'web') {
        const initialEvents = await RNCallKeep.getInitialEvents();
        // If an AnswerCall event is found, handle it (requires logic to wait for WS reconnect)
        // For simple recovery: The Caller usually keeps ringing. 
        // We wait for the 'offer' to come in via WS again.
      }
    };
    init();

    return () => endCall();
  }, []);

  const setupCallKeep = async () => {
    if (Platform.OS === 'web') return;
    try {
      await RNCallKeep.setup({
        ios: { appName: 'SocialConnect' },
        android: {
          alertTitle: 'Permissions required',
          alertDescription: 'This app needs to access your phone accounts',
          cancelButton: 'Cancel',
          okButton: 'ok',
          additionalPermissions: [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO],
          foregroundService: {
            channelId: 'com.socialconnect.call',
            channelName: 'Social Connect Call',
            notificationTitle: 'Social Connect is running in background',
          },
        },
      });
      RNCallKeep.setAvailable(true);
    } catch (err) {
      console.error('CallKeep setup error:', err);
    }
  };

  // ============================================================
  // 2️⃣ SIGNALING (WebSocket)
  // ============================================================
  useEffect(() => {
    if (!ws) return;

    const handleMessage = async (event: WebSocketMessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type !== 'webrtc_signal_message') return;

        const { data, sender } = msg;

        // A. INCOMING OFFER (Ringing)
        if (data.type === 'offer') {
          if (callState !== 'idle') {
            // BUSY: Send 'busy' signal or ignore
            return; 
          }
          
          console.log("📞 Incoming Offer from:", sender);
          targetUserId.current = sender;
          setCallerId(sender);
          setCallState('ringing');
          setIsVideoEnabled(data.isVideo || false); // Check offer intent

          // Start ringing UI
          const callUUID = generateUUID();
          currentCallUUID.current = callUUID;
          RNCallKeep.displayIncomingCall(callUUID, sender, sender, 'generic', data.isVideo);
          
          // Prepare PC but wait for answer to process SDP
          await createPeerConnection();
          // Store remote description? Or wait until accept?
          // WebRTC Standard: Set Remote Desc NOW to generate candidates, but wait to answer.
          if (peerConnection.current) {
             await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data));
             processIceQueue(); // Flush any early candidates
          }
        } 
        
        // B. INCOMING ANSWER (Connected)
        else if (data.type === 'answer') {
          console.log("✅ Call Answered");
          clearCallTimeout(); // Stop the 30s timer
          setCallState('connected');
          
          if (peerConnection.current) {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data));
            processIceQueue();
          }
        } 
        
        // C. ICE CANDIDATE
        else if (data.type === 'ice') {
          const candidate = new RTCIceCandidate(data.candidate);
          if (peerConnection.current && peerConnection.current.remoteDescription) {
            await peerConnection.current.addIceCandidate(candidate);
          } else {
            // 🧊 Queue it if Remote Desc isn't ready
            iceCandidateQueue.current.push(candidate);
          }
        }
        
        // D. HANGUP
        else if (data.type === 'bye') {
            endCall();
        }

      } catch (e) {
        console.error("WebRTC Signal Error", e);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, callState]);

  // ============================================================
  // 3️⃣ CORE WEBRTC LOGIC
  // ============================================================
  
  const createPeerConnection = async () => {
    if (peerConnection.current) peerConnection.current.close();

    // ⚡️ Fix TypeScript 'any' casting for RNWebRTC compatibility
    const pc = new RTCPeerConnection(PEER_CONNECTION_CONFIG) as any;
    peerConnection.current = pc;

    pc.onicecandidate = (event: any) => {
      if (event.candidate && targetUserId.current) {
        sendSignal({ type: 'ice', candidate: event.candidate });
      }
    };

    pc.ontrack = (event: any) => {
      if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
      }
    };

    // 🔄 ICE RESTART HANDLER
    pc.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.log("⚠️ ICE Failed, attempting restart...");
        pc.restartIce();
      }
      if (pc.iceConnectionState === 'disconnected') {
        // Optional: Show "Reconnecting..." UI
      }
    };

    return pc;
  };

  const processIceQueue = async () => {
    if (!peerConnection.current) return;
    for (const candidate of iceCandidateQueue.current) {
      await peerConnection.current.addIceCandidate(candidate);
    }
    iceCandidateQueue.current = [];
  };

  const getLocalStream = async (isVideo: boolean) => {
    const hasPerms = await checkCallPermissions(isVideo);
    if (!hasPerms) {
        Alert.alert("Permission Denied", "Camera/Microphone permissions are required.");
        return null;
    }

    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? {
            width: 640,
            height: 480,
            frameRate: 30,
            facingMode: 'user',
        } : false,
      });
      
      setLocalStream(stream);
      setIsVideoEnabled(isVideo);

      if (peerConnection.current) {
        stream.getTracks().forEach(track => {
            peerConnection.current?.addTrack(track, stream);
        });
      }
      return stream;
    } catch (err) {
      console.error("Stream Error", err);
      return null;
    }
  };

  const sendSignal = (data: any) => {
    if (ws?.readyState === WebSocket.OPEN && targetUserId.current) {
      ws.send(JSON.stringify({
        command: 'call_signal',
        target: targetUserId.current,
        data: data
      }));
    }
  };

  // ============================================================
  // 4️⃣ CALL ACTIONS
  // ============================================================

  const startCall = async (targetId: string, isVideo: boolean = false) => {
    if (callState !== 'idle') return;
    
    targetUserId.current = targetId;
    setCallState('calling');
    setCallerId(targetId);

    // ⏱ TIMEOUT: 30 seconds to answer
    callTimeoutRef.current = setTimeout(() => {
        console.log("⏰ Call timed out");
        endCall();
    }, 30000);

    const pc = await createPeerConnection();
    await getLocalStream(isVideo);
    
    InCallManager.start({ media: isVideo ? 'video' : 'audio' });
    InCallManager.setKeepScreenOn(true);

    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);

    sendSignal({ type: 'offer', sdp: offer.sdp, isVideo });

    const uuid = generateUUID();
    currentCallUUID.current = uuid;
    RNCallKeep.startCall(uuid, targetId, targetId);
  };

  const acceptCall = async (uuid?: string) => {
    const activeUUID = uuid || currentCallUUID.current;
    if (!peerConnection.current) return;

    setCallState('connecting');
    clearCallTimeout(); // Clear any existing timers (safety)

    // Ensure we have media before answering
    await getLocalStream(isVideoEnabled); // Use format from offer

    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);

    sendSignal({ type: 'answer', sdp: answer.sdp });

    setCallState('connected');
    
    InCallManager.start({ media: isVideoEnabled ? 'video' : 'audio' });
    InCallManager.stopRingtone();
    
    if (activeUUID) {
        RNCallKeep.setCurrentCallActive(activeUUID);
    }
  };

  const endCall = () => {
    if (targetUserId.current) sendSignal({ type: 'bye' });

    if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        setLocalStream(null);
    }
    setRemoteStream(null);
    setCallState('idle');
    setCallerId(null);
    targetUserId.current = null;
    iceCandidateQueue.current = [];
    clearCallTimeout();

    InCallManager.stop();
    if (currentCallUUID.current) {
        RNCallKeep.endCall(currentCallUUID.current);
        currentCallUUID.current = null;
    }
  };

  const clearCallTimeout = () => {
    if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
    }
  };

  // ============================================================
  // 5️⃣ MEDIA CONTROLS
  // ============================================================

  const toggleMute = () => {
    if (localStream) {
        localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
        setIsMuted(!isMuted);
    }
  };

  const toggleSpeaker = () => {
      const newStatus = !isSpeakerOn;
      InCallManager.setForceSpeakerphoneOn(newStatus);
      setIsSpeakerOn(newStatus);
  };

  const switchCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        // @ts-ignore
        track._switchCamera();
      });
    }
  };

  // 📹 VIDEO UPGRADE/DOWNGRADE (Renegotiation)
  const toggleVideo = async () => {
    const newVideoState = !isVideoEnabled;
    
    if (newVideoState) {
        // AUDIO -> VIDEO
        const stream = await getLocalStream(true);
        if (stream && peerConnection.current) {
            // Negotiate new offer
            const offer = await peerConnection.current.createOffer({});
            await peerConnection.current.setLocalDescription(offer);
            sendSignal({ type: 'offer', sdp: offer.sdp, isVideo: true });
        }
    } else {
        // VIDEO -> AUDIO
        // Stop video tracks locally
        if (localStream) {
            localStream.getVideoTracks().forEach(t => t.stop());
        }
        // Ideally remove track from PC and renegotiate, 
        // but stopping track is often enough for simple implementations.
    }
    setIsVideoEnabled(newVideoState);
  };

  // ============================================================
  // 6️⃣ CALLKEEP LISTENERS
  // ============================================================
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const onAnswerCall = ({ callUUID }: { callUUID: string }) => {
        console.log("CallKeep: User answered call", callUUID);
        acceptCall(callUUID);
    };

    const onEndCall = ({ callUUID }: { callUUID: string }) => {
        console.log("CallKeep: User ended call");
        endCall();
    };

    RNCallKeep.addEventListener('answerCall', onAnswerCall);
    RNCallKeep.addEventListener('endCall', onEndCall);

    return () => {
      RNCallKeep.removeEventListener('answerCall');
      RNCallKeep.removeEventListener('endCall');
    };
  }, []);

  return (
    <WebRTCContext.Provider
      value={{
        callState,
        localStream,
        remoteStream,
        callerId,
        isMuted,
        isSpeakerOn,
        isVideoEnabled,
        startCall,
        acceptCall,
        endCall,
        toggleMute,
        toggleSpeaker,
        toggleVideo,
        switchCamera,
      }}
    >
      {children}
    </WebRTCContext.Provider>
  );
};