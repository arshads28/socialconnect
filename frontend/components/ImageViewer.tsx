import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
  Pressable,
  ActivityIndicator,
  Platform,
  Image,
  SafeAreaView
} from 'react-native';
import ImageViewing from 'react-native-image-viewing';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { getLocalInbox } from '../utils/db'; // Ensure this path is correct

interface Props {
  visible: boolean;
  images: { uri: string }[];
  index: number;
  onClose: () => void;
  // Updated to accept array of users
  onForward: (uris: string[], targetUsers: string[]) => void;
}

export default function ImageViewer({
  visible,
  images,
  index,
  onClose,
  onForward,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(index);
  
  // Selection States
  const [forwardMode, setForwardMode] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set());
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  
  // UI States
  const [showUserModal, setShowUserModal] = useState(false);
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [downloading, setDownloading] = useState(false);

  // Load users when modal opens
  useEffect(() => {
    if (showUserModal) {
      const inbox = getLocalInbox();
      // Deduplicate users based on conversation_id
      const unique = inbox.filter((v,i,a)=>a.findIndex(t=>(t.conversation_id === v.conversation_id))===i);
      setRecentUsers(unique);
      setSelectedUsers(new Set()); // Reset selections
    }
  }, [showUserModal]);

  // Handle Image Selection
  const toggleImageSelect = (idx: number) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  // Handle User Selection
  const toggleUserSelect = (userId: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  /* ---------------- ACTIONS ---------------- */

  const handleDownload = async (uri: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permission required');

      setDownloading(true);
      let localUri = uri;

      if (uri.startsWith('http')) {
        const filename = uri.split('/').pop() || 'download.jpg';
        const fileDir = FileSystem.cacheDirectory + filename;
        const result = await FileSystem.downloadAsync(uri, fileDir);
        localUri = result.uri;
      }

      await MediaLibrary.saveToLibraryAsync(localUri);
      Alert.alert('Saved', 'Image saved to gallery');
    } catch (e) {
      Alert.alert('Error', 'Failed to save image');
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async (uri: string) => {
    if (await Sharing.isAvailableAsync()) {
        // Download first to share actual file, not just link
        const filename = uri.split('/').pop() || 'share.jpg';
        const fileDir = FileSystem.cacheDirectory + filename;
        const result = await FileSystem.downloadAsync(uri, fileDir);
        await Sharing.shareAsync(result.uri);
    } else {
        Alert.alert('Sharing not available');
    }
  };

  // Start the Forward Process
  const initForward = () => {
    setForwardMode(true);
    // Auto-select the current image if nothing is selected
    if (selectedImages.size === 0) {
      setSelectedImages(new Set([currentIndex]));
    }
  };

  // Open User Picker
  const openUserPicker = () => {
    if (selectedImages.size === 0) {
        // If nothing selected but button clicked, select current
        setSelectedImages(new Set([currentIndex]));
    }
    setShowUserModal(true);
  };

  // Final Send Action
  const performSend = () => {
    if (selectedUsers.size === 0) return;

    const imagesToSend = Array.from(selectedImages).map(i => images[i].uri);
    const usersRecipients = Array.from(selectedUsers);

    onForward(imagesToSend, usersRecipients);

    // Reset UI
    setShowUserModal(false);
    setForwardMode(false);
    setSelectedImages(new Set());
    setSelectedUsers(new Set());
    
    Alert.alert('Sent', `Shared with ${usersRecipients.length} people`);
  };

  /* ---------------- COMPONENTS ---------------- */

  const Header = ({ imageIndex }: { imageIndex: number }) => (
    <SafeAreaView style={styles.headerContainer}>
      <View style={styles.headerContent}>
        {/* Close Button */}
        <TouchableOpacity 
            onPress={() => {
                if(forwardMode) {
                    setForwardMode(false);
                    setSelectedImages(new Set());
                } else {
                    onClose();
                }
            }} 
            style={styles.iconBtn}
        >
          <Ionicons name={forwardMode ? "arrow-back" : "close"} size={26} color="#fff" />
        </TouchableOpacity>

        <View style={styles.rightActions}>
          {/* If in Forward Mode -> Show "Next" Button */}
          {forwardMode ? (
            <TouchableOpacity 
              onPress={openUserPicker}
              style={[styles.nextBtn, selectedImages.size === 0 && { opacity: 0.5 }]}
              disabled={selectedImages.size === 0}
            >
              <Text style={styles.nextText}>Next ({selectedImages.size})</Text>
            </TouchableOpacity>
          ) : (
            /* Normal Mode -> Show Actions */
            <>
              <TouchableOpacity onPress={() => handleDownload(images[imageIndex].uri)} style={styles.iconBtn}>
                <Ionicons name="download-outline" size={24} color="#fff" />
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => handleShare(images[imageIndex].uri)} style={[styles.iconBtn, { marginHorizontal: 10 }]}>
                <Ionicons name="share-outline" size={24} color="#fff" />
              </TouchableOpacity>

              {/* Instagram Style Paper Plane */}
              <TouchableOpacity onPress={initForward} style={[styles.iconBtn, { backgroundColor: '#0095f6' }]}>
                <Ionicons name="paper-plane-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );

  return (
    <>
      <ImageViewing
        images={images}
        imageIndex={currentIndex}
        visible={visible}
        onRequestClose={onClose}
        onImageIndexChange={setCurrentIndex}
        HeaderComponent={Header}
        presentationStyle="overFullScreen"
        animationType="fade"
        doubleTapToZoomEnabled={!forwardMode} // Disable zoom when selecting
        swipeToCloseEnabled={!forwardMode}
        FooterComponent={() => (forwardMode ? <View style={styles.footerHint}><Text style={styles.footerText}>Tap images to select</Text></View> : undefined)}
        imageComponent={({ source, imageIndex }) => (
          <Pressable 
            style={{ flex: 1 }} 
            onLongPress={() => {
                if(!forwardMode) {
                    initForward();
                    toggleImageSelect(imageIndex!); // Select the one long-pressed
                }
            }}
            onPress={() => {
                // If forward mode, toggle select. If not, let the library handle zoom/controls (default behavior is passed through if we don't stop propagation, but Pressable catches it, so we handle logic manually)
                if (forwardMode) {
                    toggleImageSelect(imageIndex!);
                } 
            }}
          >
            <Image 
                source={source} 
                style={[{ flex: 1, width: '100%', height: '100%' }, { resizeMode: 'contain' }]} 
            />
            
            {/* Selection Overlay */}
            {forwardMode && (
              <View style={styles.selectionOverlay}>
                <View style={[styles.radioButton, selectedImages.has(imageIndex!) && styles.radioButtonSelected]}>
                  {selectedImages.has(imageIndex!) && <Ionicons name="checkmark" size={18} color="#fff" />}
                </View>
              </View>
            )}
          </Pressable>
        )}
      />

      {/* ---------------- USER SELECTION MODAL ---------------- */}
      <Modal visible={showUserModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowUserModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Send to...</Text>
            <TouchableOpacity onPress={() => setShowUserModal(false)}>
              <Ionicons name="close" size={28} color="#000" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={recentUsers}
            keyExtractor={(i) => i.conversation_id}
            contentContainerStyle={{ paddingBottom: 100 }}
            renderItem={({ item }) => {
              const isSelected = selectedUsers.has(item.conversation_id);
              return (
                <TouchableOpacity 
                  style={[styles.userRow, isSelected && { backgroundColor: '#f0f8ff' }]} 
                  onPress={() => toggleUserSelect(item.conversation_id)}
                >
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person" size={24} color="#888" />
                  </View>
                  <Text style={styles.userName}>{item.conversation_id}</Text>
                  
                  {/* Multi-Select Checkbox */}
                  <View style={[styles.userCheckbox, isSelected && styles.userCheckboxSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyText}>No recent chats found.</Text>}
          />

          {/* Send Button Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity 
              style={[styles.sendBtn, selectedUsers.size === 0 && { backgroundColor: '#ccc' }]}
              disabled={selectedUsers.size === 0}
              onPress={performSend}
            >
              <Text style={styles.sendBtnText}>
                Send {selectedImages.size} image{selectedImages.size > 1 ? 's' : ''} to {selectedUsers.size > 0 ? `${selectedUsers.size} users` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Loading Indicator */}
      {downloading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', marginTop: 10 }}>Saving...</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 10,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 10, // Adjust for status bar
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  nextBtn: {
    backgroundColor: '#0095f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  nextText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  footerHint: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 20
  },
  footerText: { color: '#fff', fontWeight: '600' },
  
  // Selection Styles
  selectionOverlay: {
    position: 'absolute', top: 20, right: 20,
    zIndex: 20,
  },
  radioButton: {
    width: 28, height: 28,
    borderRadius: 14,
    borderWidth: 2, borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  radioButtonSelected: {
    backgroundColor: '#0095f6',
    borderColor: '#0095f6',
  },

  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  userRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16,
  },
  avatarPlaceholder: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  userName: { flex: 1, fontSize: 16, color: '#000' },
  userCheckbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#ccc',
    justifyContent: 'center', alignItems: 'center',
  },
  userCheckboxSelected: {
    backgroundColor: '#0095f6', borderColor: '#0095f6',
  },
  modalFooter: {
    padding: 16, borderTopWidth: 1, borderTopColor: '#eee',
  },
  sendBtn: {
    backgroundColor: '#0095f6',
    paddingVertical: 14, borderRadius: 8,
    alignItems: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#888' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 999,
  },
});