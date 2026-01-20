import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Platform, Alert } from 'react-native';
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

/* ============================================================
   🛠 CONFIGURATION (Metered.ca + Google)
============================================================ */
const PEER_CONNECTION_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: [
        'turn:global.relay.metered.ca:80',
        'turn:global.relay.metered.ca:80?transport=tcp',
        'turn:global.relay.metered.ca:443',
        'turns:global.relay.metered.ca:443?transport=tcp',
      ],
      username: 'a66c44bf00367da9f7fac4cc',
      credential: 'ti/h+/N6grLizoNJ',
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle' as const,
};

export type CallState = 
  | 'idle' 
  | 'calling' 
  | 'ringing' 
  | 'connecting' 
  | 'connected' 
  | 'ending';

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
  const iceCandidateQueue = useRef<RTCIceCandidate[]>([]);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ============================================================
  // 1️⃣ INITIAL SETUP
  // ============================================================
  useEffect(() => {
    const init = async () => {
      await setupCallKeep();
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
          additionalPermissions: [],
          selfManaged: true,
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
  // 2️⃣ CORE WEBRTC LOGIC (addTrack Pattern)
  // ============================================================
  
  const createPeerConnection = async () => {
    if (peerConnection.current) peerConnection.current.close();

    const pc = new RTCPeerConnection(PEER_CONNECTION_CONFIG) as any;
    peerConnection.current = pc;

    pc.onicecandidate = (event: any) => {
      if (event.candidate && targetUserId.current) {
        sendSignal({ type: 'ice', candidate: event.candidate });
      }
    };

    pc.ontrack = (event: any) => {
      console.log("🎥 Remote Track Received:", event.streams[0]?.id);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.log("⚠️ ICE Failed, attempting restart...");
        pc.restartIce();
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

  // 🔥 CORE: Get Stream & Add Tracks directly
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

      const pc = peerConnection.current;
      if (pc) {
        // 🔥 DIRECT ADD TRACK (The only way on RN-WebRTC)
        stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
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
  // 3️⃣ SIGNALING HANDLER
  // ============================================================
  useEffect(() => {
    if (!ws) return;

    const handleMessage = async (event: WebSocketMessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type !== 'webrtc_signal_message') return;

        const { data, sender } = msg;

        // OFFER (Receiver)
        if (data.type === 'offer') {
          console.log("📞 Incoming Offer from:", sender);
          targetUserId.current = sender;
          setCallerId(sender);
          setCallState('ringing');
          setIsVideoEnabled(data.isVideo || false);

          const callUUID = generateUUID();
          currentCallUUID.current = callUUID;
          RNCallKeep.displayIncomingCall(callUUID, sender, sender, 'generic', data.isVideo);
          
          // 1. Create PC
          const pc = await createPeerConnection();
          if (pc) {
             // 2. Set Remote (Don't create answer yet)
             await pc.setRemoteDescription(new RTCSessionDescription(data));
             processIceQueue();
          }
        } 
        
        // ANSWER (Caller)
        else if (data.type === 'answer') {
          console.log("✅ Call Answered");
          clearCallTimeout();
          setCallState('connected');
          
          if (peerConnection.current) {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data));
            processIceQueue();
          }
        } 
        
        // ICE
        else if (data.type === 'ice') {
          const candidate = new RTCIceCandidate(data.candidate);
          if (peerConnection.current && peerConnection.current.remoteDescription) {
            await peerConnection.current.addIceCandidate(candidate);
          } else {
            iceCandidateQueue.current.push(candidate);
          }
        }
        
        // BYE
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
  // 4️⃣ CALL ACTIONS
  // ============================================================

  const startCall = async (targetId: string, isVideo: boolean = false) => {
    if (callState !== 'idle') return;
    
    targetUserId.current = targetId;
    setCallState('calling');
    setCallerId(targetId);

    // Timeout: 30s
    callTimeoutRef.current = setTimeout(() => {
        console.log("⏰ Call timed out");
        endCall();
    }, 30000);

    // 1. Create PC
    const pc = await createPeerConnection();

    // 2. Get Stream & Add Tracks
    const stream = await getLocalStream(isVideo); 
    if (!stream) return;

    // 3. Audio Config
    InCallManager.start({ media: isVideo ? 'video' : 'audio' });
    InCallManager.setForceSpeakerphoneOn(isVideo);

    // 4. Create Offer
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
    clearCallTimeout();

    // 🔥 CRITICAL ORDER:
    // 1. Remote Desc (Already set in offer handler)
    // 2. Add Tracks
    // 3. Create Answer

    const stream = await getLocalStream(isVideoEnabled); // Adds tracks to PC
    if (!stream) {
        endCall();
        return;
    }

    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);

    sendSignal({ type: 'answer', sdp: answer.sdp });

    setCallState('connected');
    
    InCallManager.start({ media: isVideoEnabled ? 'video' : 'audio' });
    InCallManager.setForceSpeakerphoneOn(isVideoEnabled);
    
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
        // 🔥 MUTE VIA TRACK, NOT RENEGOTIATION
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

  // 📹 VIDEO RENEGOTIATION (SAFE WAY)
  const toggleVideo = async () => {
    const newVideoState = !isVideoEnabled;
    const pc = peerConnection.current;

    if (newVideoState) {
        // 1. VIDEO ON: Get new stream (Audio+Video)
        const stream = await getLocalStream(true);
        if (stream && pc) {
            // 2. Renegotiate
            const offer = await pc.createOffer({});
            await pc.setLocalDescription(offer);
            sendSignal({ type: 'offer', sdp: offer.sdp, isVideo: true });
        }
    } else {
        // 1. VIDEO OFF: Stop tracks
        if (localStream) {
            localStream.getVideoTracks().forEach(t => t.stop());
        }
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