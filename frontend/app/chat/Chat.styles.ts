import { StyleSheet, Platform } from 'react-native'; // 1. Removed unused Dimensions
import { Colors } from '../../constants/Colors';

export const createStyles = (colors: typeof Colors.light, insets: { top: number, bottom: number }) => StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.background 
  },
  
  // ================= HEADER =================
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16,
    paddingVertical: 10, 
    borderBottomWidth: 1, 
    borderColor: colors.border,
    backgroundColor: colors.background, 
    zIndex: 10
  },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  headerStatus: { fontSize: 12, color: colors.subText },
  headerStatusTyping: { fontSize: 12, fontWeight: 'bold', color: colors.tint },
  headerStatusOnline: { color: '#4caf50', fontWeight: 'bold' }, // Consider moving this hex to your Colors constant
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  avatarPlaceholder: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    marginRight: 10, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: colors.border 
  },
  
  // ================= LIST =================
  messagesList: { 
    paddingHorizontal: 12, 
    paddingVertical: 16 
  },
  
  // ================= BUBBLES =================
  messageRow: { marginBottom: 12, maxWidth: '75%' },
  messageRowLeft: { alignSelf: 'flex-start' },
  messageRowRight: { alignSelf: 'flex-end' },
  
  bubble: { 
    padding: 10, 
    borderRadius: 18, 
    overflow: 'hidden',
    minWidth: 80,
  }, 
  messageText: { 
    fontSize: 15, 
    marginBottom: 4, 
    lineHeight: 22 // 2. Increased slightly for better readability
  },
  
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
  timestamp: { fontSize: 10 },
  
  // ================= MEDIA & ALBUMS =================
  mediaImage: { width: 220, height: 220, borderRadius: 10 },
  mediaOverlay: { 
    ...StyleSheet.absoluteFillObject, // 3. Use absoluteFillObject shorthand
    backgroundColor: 'rgba(0,0,0,0.3)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderRadius: 10 
  },
  
  albumContainer: { 
    width: 250, 
    borderRadius: 16, 
    overflow: 'hidden', 
    marginBottom: 2, 
    backgroundColor: 'transparent',
    // 4. Added flexWrap to ensure grid works if children don't enforce it
    flexDirection: 'row', 
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  
  albumImageFull: { width: '100%', height: 200, marginBottom: 2 }, 
  albumImageHalf: { width: '49.5%', height: 120, marginBottom: 2 }, 
  albumImageVerticalStack: { width: '100%', height: 150, marginBottom: 2 }, 

  albumImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  
  overflowOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  overflowText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  
  selectionTickContainer: { 
    position: 'absolute', 
    bottom: 8, 
    right: 8, 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    zIndex: 10, 
    padding: 2 
  },

  // ================= INPUT AREA =================
  inputContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 12, 
    paddingTop: 10, 
    borderTopWidth: 1, 
    borderColor: colors.border, 
    minHeight: 60, 
    paddingBottom: Math.max(insets.bottom, 12), 
    backgroundColor: colors.background 
  },
  input: { 
    flex: 1, 
    borderRadius: 20, 
    paddingHorizontal: 16, 
    paddingTop: Platform.OS === 'ios' ? 12 : 10, 
    paddingBottom: Platform.OS === 'ios' ? 12 : 10, 
    marginRight: 10, 
    maxHeight: 100, 
    fontSize: 16, 
    backgroundColor: colors.card, 
    color: colors.text 
  },
  sendBtn: { padding: 4 },
  
  // ================= RECORDING =================
  recordingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, justifyContent: 'space-between' },
  recTimer: { fontSize: 16, fontWeight: 'bold', marginLeft: 10, minWidth: 40, color: colors.text },
  
  recordingMicPulse: { 
    backgroundColor: colors.danger, // 5. FIXED: Was using Colors.light.danger directly
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    justifyContent: 'center', 
    alignItems: 'center', 
    shadowColor: colors.danger, // 5. FIXED: Was using Colors.light.danger directly
    shadowOpacity: 0.4, 
    shadowRadius: 6,
    elevation: 4
  },
  cancelRecButton: { padding: 10, marginRight: 8 },
  sendRecButton: { 
    backgroundColor: colors.tint, // 5. FIXED: Was using Colors.light.tint directly
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginLeft: 12 
  },

  // ================= UNDO SNACKBAR =================
  undoSnackbar: { 
    position: 'absolute', 
    minWidth: 200, 
    backgroundColor: '#323232', // NOTE: This is hardcoded dark gray. Ensure this looks good in Dark Mode (it might blend in too much).
    borderRadius: 8, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 4, 
    elevation: 5, 
    zIndex: 999, 
    overflow: 'hidden' 
  },
  undoText: { color: '#fff', fontSize: 14, fontWeight: '500', zIndex: 2, marginRight: 10 },
  undoButton: { padding: 4, zIndex: 2 },
  undoButtonText: { color: '#4dabf7', fontWeight: 'bold', fontSize: 14 },
});