import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ImageViewing from 'react-native-image-viewing';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { getLocalInbox } from '../utils/db';
import { useAuth } from '../context/AuthContext'; 
import { getCachedFile, saveToGallery } from '../utils/mediaCache';

interface Props {
  visible: boolean;
  images: { uri: string }[];
  index: number;
  onClose: () => void;
  onForward: (uris: string[], targetUsers: string[]) => void;
}

export default function ImageViewer({ visible, images, index, onClose, onForward }: Props) {
  const { user } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(index);
  
  // States
  const [forwardMode, setForwardMode] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set());
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [showUserModal, setShowUserModal] = useState(false);
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [downloading, setDownloading] = useState(false);

  // ✅ Helper to clean display names in the UI list
  const cleanUsername = (id: string) => {
      if (id.includes('__') && user?.username) {
          return id.split('__').find(p => p !== user.username) || id;
      }
      return id;
  };

  useEffect(() => {
    if (showUserModal) {
      const inbox = getLocalInbox() || [];
      const unique = inbox.filter((v: any, i: number, a: any[]) => 
        a.findIndex((t: any) => t.conversation_id === v.conversation_id) === i
      );
      setRecentUsers(unique);
      setSelectedUsers(new Set()); 
    }
  }, [showUserModal]);

  /* ---------------- ACTIONS ---------------- */

  const handleDownload = async (uri: string) => {
    try {
      setDownloading(true);
      // 1. Download to local cache
      const localUri = await getCachedFile(uri);
      // 2. Save to "Connect" Album
      await saveToGallery(localUri);
      
      Alert.alert('Saved', 'Image saved to "Connect" album');
    } catch (e) {
      console.log(e);
      Alert.alert('Error', 'Failed to save image');
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async (uri: string) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        const localUri = await getCachedFile(uri);
        await Sharing.shareAsync(localUri);
      } else {
        Alert.alert('Sharing not available');
      }
    } catch (e) {
      console.log(e);
    }
  };

  /* ---------------- LOGIC ---------------- */

  const toggleImageSelect = (idx: number) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleUserSelect = (userId: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const initForward = () => {
    setForwardMode(true);
    if (selectedImages.size === 0) setSelectedImages(new Set([currentIndex]));
  };

  const openUserPicker = () => {
    if (selectedImages.size === 0) setSelectedImages(new Set([currentIndex]));
    setShowUserModal(true);
  };

  const performSend = () => {
    if (selectedUsers.size === 0) return;
    const imagesToSend = Array.from(selectedImages).map(i => images[i].uri);
    const usersRecipients = Array.from(selectedUsers); // Pass IDs to parent
    onForward(imagesToSend, usersRecipients);
    setShowUserModal(false);
    setForwardMode(false);
    setSelectedImages(new Set());
    setSelectedUsers(new Set());
  };

  /* ---------------- UI ---------------- */

  const Header = ({ imageIndex }: { imageIndex: number }) => (
    <SafeAreaView style={styles.headerContainer}>
      <View style={styles.headerContent}>
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
          {forwardMode ? (
            <TouchableOpacity onPress={openUserPicker} style={[styles.nextBtn, selectedImages.size === 0 && { opacity: 0.5 }]} disabled={selectedImages.size === 0}>
              <Text style={styles.nextText}>Next ({selectedImages.size})</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity onPress={() => handleDownload(images[imageIndex].uri)} style={styles.iconBtn}>
                <Ionicons name="download-outline" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleShare(images[imageIndex].uri)} style={[styles.iconBtn, { marginHorizontal: 10 }]}>
                <Ionicons name="share-outline" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={initForward} style={[styles.iconBtn, { backgroundColor: '#0095f6' }]}>
                <Ionicons name="paper-plane-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );

  const Footer = ({ imageIndex }: { imageIndex: number }) => {
    if (!forwardMode) return null;
    const isSelected = selectedImages.has(imageIndex);
    return (
      <View style={styles.footerContainer}>
        <TouchableOpacity style={styles.selectButton} onPress={() => toggleImageSelect(imageIndex)}>
          <Ionicons name={isSelected ? "checkmark-circle" : "ellipse-outline"} size={32} color={isSelected ? "#0095f6" : "#fff"} />
          <Text style={styles.footerText}>{isSelected ? "Selected" : "Tap to Select"}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <>
      <ImageViewing
        images={images}
        imageIndex={currentIndex}
        visible={visible}
        onRequestClose={onClose}
        onImageIndexChange={setCurrentIndex}
        HeaderComponent={Header}
        FooterComponent={Footer}
        presentationStyle="overFullScreen"
        animationType="fade"
        doubleTapToZoomEnabled={!forwardMode} 
        swipeToCloseEnabled={!forwardMode}
      />

      {/* USER MODAL */}
      <Modal visible={showUserModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowUserModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Send to...</Text>
            <TouchableOpacity onPress={() => setShowUserModal(false)}><Ionicons name="close" size={28} color="#000" /></TouchableOpacity>
          </View>
          <FlatList
            data={recentUsers}
            keyExtractor={(i) => i.conversation_id}
            renderItem={({ item }) => {
              const isSelected = selectedUsers.has(item.conversation_id);
              // ✅ CLEAN NAME FOR UI
              const displayName = cleanUsername(item.conversation_id); 
              return (
                <TouchableOpacity style={[styles.userRow, isSelected && { backgroundColor: '#f0f8ff' }]} onPress={() => toggleUserSelect(item.conversation_id)}>
                  <View style={styles.avatarPlaceholder}><Ionicons name="person" size={24} color="#888" /></View>
                  <Text style={styles.userName}>{displayName}</Text>
                  <View style={[styles.userCheckbox, isSelected && styles.userCheckboxSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyText}>No recent chats found.</Text>}
          />
          <View style={styles.modalFooter}>
            <TouchableOpacity style={[styles.sendBtn, selectedUsers.size === 0 && { backgroundColor: '#ccc' }]} disabled={selectedUsers.size === 0} onPress={performSend}>
              <Text style={styles.sendBtnText}>Send {selectedImages.size} image{selectedImages.size !== 1 ? 's' : ''}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {downloading && <View style={styles.loadingOverlay}><ActivityIndicator size="large" color="#fff" /><Text style={{ color: '#fff', marginTop: 10 }}>Saving...</Text></View>}
    </>
  );
}

const styles = StyleSheet.create({
  headerContainer: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 10 },
  rightActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  nextBtn: { backgroundColor: '#0095f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  nextText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  footerContainer: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 30, zIndex: 999 },
  selectButton: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  userRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  userName: { flex: 1, fontSize: 16, color: '#000' },
  userCheckbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
  userCheckboxSelected: { backgroundColor: '#0095f6', borderColor: '#0095f6' },
  modalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  sendBtn: { backgroundColor: '#0095f6', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  sendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#888' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
});