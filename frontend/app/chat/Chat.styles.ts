import { StyleSheet, Platform, Dimensions } from 'react-native';
import { Colors } from '../../constants/Colors';

const { width, height } = Dimensions.get('window');

export const createStyles = (colors: typeof Colors.light, insets: { top: number, bottom: number }) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  
  // ================= HEADER =================
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    paddingHorizontal: 16, paddingVertical: 10, 
    borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.background, zIndex: 10
  },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  headerStatus: { fontSize: 12, color: colors.subText },
  headerStatusTyping: { fontSize: 12, fontWeight: 'bold', color: colors.tint },
  headerStatusOnline: { color: '#4caf50', fontWeight: 'bold' },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, marginRight: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.border },
  
  // ================= LIST & BUBBLES =================
  messagesList: { paddingHorizontal: 12, paddingVertical: 16 },
  messageRow: { marginBottom: 12, maxWidth: '80%' },
  messageRowLeft: { alignSelf: 'flex-start' },
  messageRowRight: { alignSelf: 'flex-end' },
  
  bubble: { padding: 10, borderRadius: 18, overflow: 'hidden', minWidth: 80 }, 
  messageText: { fontSize: 15, marginBottom: 4, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
  timestamp: { fontSize: 10 },
  
  // =================  ALBUM LAYOUTS (The Fix) =================
  albumContainer: { width: 260, borderRadius: 16, overflow: 'hidden', marginBottom: 2, backgroundColor: 'transparent' },
  albumImage: { width: '100%', height: '100%', resizeMode: 'cover' },

  // 1. Two Photos (Vertical Stack)
  stackContainer: { flexDirection: 'column', height: 300 }, 
  stackItemTop: { width: '100%', flex: 1, marginBottom: 2 },
  stackItemBottom: { width: '100%', flex: 1 },

  // 2. Three Photos (1 Big, 2 Small)
  triContainer: { flexDirection: 'row', flexWrap: 'wrap', height: 240 },
  triItemMain: { width: '100%', height: 140, marginBottom: 2 },
  triItemSmall: { width: '49.5%', height: 98 }, 

  // 3. Grid (4+ Photos)
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', height: 240, alignContent: 'flex-start' },
  gridItem: { width: '49.5%', height: 118, marginBottom: 2 }, 

  // =================ALBUM FEED MODAL (PURE BLACK FIX) =================
  albumModalContainer: { flex: 1, backgroundColor: '#000000' },
  albumModalHeader: { 
    position: 'absolute', top: insets.top, left: 0, right: 0, height: 60, 
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, zIndex: 20 
  },
  albumModalClose: { padding: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20 },
  albumList: { paddingVertical: 20, backgroundColor: '#000000' },
  albumFeedItem: { width: width, marginBottom: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  albumFeedImage: { width: width, height: height * 0.6, resizeMode: 'contain', backgroundColor: '#000000' }, // ✅ Pure Black Image Bg

  // ================= COMMON & UTILS =================
  mediaImage: { width: 220, height: 220, borderRadius: 10 },
  mediaOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  overflowOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  overflowText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  selectionTickContainer: { position: 'absolute', bottom: 8, right: 8, backgroundColor: '#fff', borderRadius: 12, zIndex: 10, padding: 2 },

  // ================= INPUT =================
  inputContainer: { 
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, 
    borderTopWidth: 1, borderColor: colors.border, minHeight: 60, 
    paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.background 
  },
  input: { 
    flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 12 : 10, paddingBottom: Platform.OS === 'ios' ? 12 : 10, 
    marginRight: 10, maxHeight: 100, fontSize: 16, backgroundColor: colors.card, color: colors.text 
  },
  sendBtn: { padding: 4 },
  recordingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, justifyContent: 'space-between' },
  recTimer: { fontSize: 16, fontWeight: 'bold', marginLeft: 10, minWidth: 40, color: colors.text },
  recordingMicPulse: { backgroundColor: Colors.light.danger, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  cancelRecButton: { padding: 10, marginRight: 8 },
  sendRecButton: { backgroundColor: Colors.light.tint, width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  
  undoSnackbar: { 
    position: 'absolute', minWidth: 200, backgroundColor: '#323232', borderRadius: 8, 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    paddingHorizontal: 16, paddingVertical: 12, elevation: 5, zIndex: 999 
  },
  undoText: { color: '#fff', fontSize: 14, fontWeight: '500', marginRight: 10 },
  undoButtonText: { color: '#4dabf7', fontWeight: 'bold', fontSize: 14 },
});