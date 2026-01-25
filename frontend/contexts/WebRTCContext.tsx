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
import AsyncStorage from '@react-native-async-storage/async-storage'; 
import { useWebSocket } from './WebSocketContext';
import { useAuth } from '../context/AuthContext';
import { generateUUID } from '../utils/db';
import { checkCallPermissions } from '../utils/webrtcPermissions';

/* ============================================================
    CONFIGURATION
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

//  DEFAULT SETTINGS (Fallback)
const DEFAULTS = { width: 480, height: 360, fps: 15, bitrate: 250 };

//  RESOLUTION MAP (Matches settings page)
const RES_MAP: any = {
  '360': { width: 480, height: 360, bitrate: 250 },
  '480': { width: 640, height: 480, bitrate: 500 },
  '720': { width: 1280, height: 720, bitrate: 1500 },
  '1080': { width: 1920, height: 1080, bitrate: 3000 },
};

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ending';

interface WebRTCContextType {
  callState: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callerId: string | null;
  callerName: string | null; 
  isMuted: boolean;
  isSpeakerOn: boolean;
  isVideoEnabled: boolean;
  startCall: (targetId: string, isVideo: boolean, targetName?: string) => void;
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


  const [callState, setCallState] = useState<CallState>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callerId, setCallerId] = useState<string | null>(null);
  const [callerName, setCallerName] = useState<string | null>(null); 
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);

 
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const targetUserId = useRef<string | null>(null);
  const currentCallUUID = useRef<string | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidate[]>([]);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentBitrateRef = useRef<number>(250); 

  // ============================================================
  //  INITIAL SETUP
  // ============================================================
  useEffect(() => {
    const init = async () => { await setupCallKeep(); };
    init();
    return () => endCall();
  }, []);

  const setupCallKeep = async () => {
    if (Platform.OS === 'web') return;
    try {
      await RNCallKeep.setup({
        ios: { appName: 'SocialConnect' },
        android: {
          alertTitle: 'Permissions',
          alertDescription: 'Access needed for calls',
          cancelButton: 'Cancel',
          okButton: 'ok',
          additionalPermissions: [],
          selfManaged: true,
          foregroundService: { channelId: 'com.socialconnect.call', channelName: 'Social Connect Call', notificationTitle: 'Call in progress' },
        },
      });
      RNCallKeep.setAvailable(true);
    } catch (err) { console.error('CallKeep error:', err); }
  };

  // ============================================================
  //  HELPER: GET USER SETTINGS
  // ============================================================
  const getUserMediaConstraints = async (isVideo: boolean) => {
    if (!isVideo) return { audio: true, video: false };

    try {
      const savedRes = await AsyncStorage.getItem('call_resolution');
      const savedFps = await AsyncStorage.getItem('call_fps');
      
      const resConfig = RES_MAP[savedRes || '360'] || RES_MAP['360'];
      const fps = parseInt(savedFps || '15');

      currentBitrateRef.current = resConfig.bitrate;

      return {
        audio: true,
        video: {
          width: resConfig.width,
          height: resConfig.height,
          frameRate: fps,
          facingMode: 'user',
        }
      };
    } catch (e) {
      currentBitrateRef.current = 250;
      return {
        audio: true,
        video: { width: 480, height: 360, frameRate: 15, facingMode: 'user' }
      };
    }
  };

  const setBandwidth = (sdp: string) => {
    const limit = currentBitrateRef.current || 250;
    return sdp.replace(/a=mid:video\r\n/g, `a=mid:video\r\nb=AS:${limit}\r\n`);
  };

  // ============================================================
  // CORE WEBRTC LOGIC
  // ============================================================
  const createPeerConnection = async () => {
    if (peerConnection.current) peerConnection.current.close();
    const pc = new RTCPeerConnection(PEER_CONNECTION_CONFIG) as any;
    peerConnection.current = pc;

    pc.onicecandidate = (event: any) => {
      if (event.candidate && targetUserId.current) sendSignal({ type: 'ice', candidate: event.candidate });
    };

    pc.ontrack = (event: any) => {
      if (event.streams && event.streams[0]) setRemoteStream(event.streams[0]);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce();
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
    if (!hasPerms) { Alert.alert("Permission Denied"); return null; }

    try {
      const constraints = await getUserMediaConstraints(isVideo);
      const stream = await mediaDevices.getUserMedia(constraints as any);
      
      setLocalStream(stream);
      setIsVideoEnabled(isVideo);

      const pc = peerConnection.current;
      if (pc) {
        const senders = pc.getSenders();
        stream.getTracks().forEach(track => {
            const hasTrack = senders.some((s: any) => s.track?.id === track.id);
            if (!hasTrack) pc.addTrack(track, stream);
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
      ws.send(JSON.stringify({ command: 'call_signal', target: targetUserId.current, data: data }));
    }
  };

  // ============================================================
  // SIGNALING
  // ============================================================
  useEffect(() => {
    if (!ws) return;
    const handleMessage = async (event: WebSocketMessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type !== 'webrtc_signal_message') return;
        const { data, sender } = msg;

        if (data.type === 'offer') {
          targetUserId.current = sender;
          setCallerId(sender); 
          setCallerName(sender);
          setCallState('ringing');
          setIsVideoEnabled(data.isVideo || false);
          
          const uuid = generateUUID();
          currentCallUUID.current = uuid;
          RNCallKeep.displayIncomingCall(uuid, sender, sender, 'generic', data.isVideo);

          const pc = await createPeerConnection();
          if (pc) {
             await pc.setRemoteDescription(new RTCSessionDescription(data));
             processIceQueue();
          }
        } else if (data.type === 'answer') {
          clearCallTimeout();
          setCallState('connected');
          if (peerConnection.current) {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data));
            processIceQueue();
          }
        } else if (data.type === 'ice') {
          const candidate = new RTCIceCandidate(data.candidate);
          if (peerConnection.current && peerConnection.current.remoteDescription) {
            await peerConnection.current.addIceCandidate(candidate);
          } else {
            iceCandidateQueue.current.push(candidate);
          }
        } else if (data.type === 'bye') {
            endCall();
        }
      } catch (e) { console.error(e); }
    };
    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, callState]);

  // ============================================================
  // ACTIONS
  // ============================================================
  const startCall = async (targetId: string, isVideo: boolean = false, targetName?: string) => {
    if (callState !== 'idle') return;
    targetUserId.current = targetId;
    setCallState('calling');
    setCallerId(targetId);
    setCallerName(targetName || targetId); 
    
    callTimeoutRef.current = setTimeout(endCall, 30000);

    const pc = await createPeerConnection();
    const stream = await getLocalStream(isVideo);
    if (!stream) return;

    InCallManager.start({ media: isVideo ? 'video' : 'audio' });
    InCallManager.setForceSpeakerphoneOn(isVideo);

    const offer = await pc.createOffer({});
    offer.sdp = setBandwidth(offer.sdp);
    
    await pc.setLocalDescription(offer);
    sendSignal({ type: 'offer', sdp: offer.sdp, isVideo });

    const uuid = generateUUID();
    currentCallUUID.current = uuid;
    RNCallKeep.startCall(uuid, targetId, targetName || targetId);
  };

  const acceptCall = async (uuid?: string) => {
    if (!peerConnection.current) return;
    setCallState('connecting');
    clearCallTimeout();

    const stream = await getLocalStream(isVideoEnabled);
    if (!stream) { endCall(); return; }

    const answer = await peerConnection.current.createAnswer();
    answer.sdp = setBandwidth(answer.sdp);

    await peerConnection.current.setLocalDescription(answer);
    sendSignal({ type: 'answer', sdp: answer.sdp });

    setCallState('connected');
    InCallManager.start({ media: isVideoEnabled ? 'video' : 'audio' });
    InCallManager.setForceSpeakerphoneOn(isVideoEnabled);
    if (uuid || currentCallUUID.current) RNCallKeep.setCurrentCallActive(uuid || currentCallUUID.current!);
  };

  const endCall = () => {
    if (targetUserId.current) sendSignal({ type: 'bye' });
    if (peerConnection.current) { peerConnection.current.close(); peerConnection.current = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); setLocalStream(null); }
    setRemoteStream(null);
    setCallState('idle');
    setCallerId(null);
    setCallerName(null);
    targetUserId.current = null;
    iceCandidateQueue.current = [];
    clearCallTimeout();
    InCallManager.stop();
    if (currentCallUUID.current) { RNCallKeep.endCall(currentCallUUID.current); currentCallUUID.current = null; }
  };

  const clearCallTimeout = () => { if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current); };
  
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
  const switchCamera = () => { localStream?.getVideoTracks().forEach((track: any) => track._switchCamera()); };
  
  const toggleVideo = async () => {
    const newVideoState = !isVideoEnabled;
    const pc = peerConnection.current;
    if (newVideoState) {
        const stream = await getLocalStream(true);
        if (stream && pc) {
            const offer = await pc.createOffer({});
            offer.sdp = setBandwidth(offer.sdp);
            await pc.setLocalDescription(offer);
            sendSignal({ type: 'offer', sdp: offer.sdp, isVideo: true });
        }
    } else {
        if (localStream) localStream.getVideoTracks().forEach(t => t.stop());
    }
    setIsVideoEnabled(newVideoState);
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    RNCallKeep.addEventListener('answerCall', ({ callUUID }) => acceptCall(callUUID));
    RNCallKeep.addEventListener('endCall', endCall);
    return () => { RNCallKeep.removeEventListener('answerCall'); RNCallKeep.removeEventListener('endCall'); };
  }, []);

  return (
    <WebRTCContext.Provider value={{ callState, localStream, remoteStream, callerId, callerName, isMuted, isSpeakerOn, isVideoEnabled, startCall, acceptCall, endCall, toggleMute, toggleSpeaker, toggleVideo, switchCamera }}>
      {children}
    </WebRTCContext.Provider>
  );
};