import React from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BASE_URL } from '../../utils/api'; 
import { AudioPlayerBubble } from '../../components/AudioComponents';

// Helper to clean URLs
const getMediaUri = (uri: string | null) => {
    if (!uri || typeof uri !== 'string') return "";
    if (uri.startsWith('/media/')) return `${BASE_URL}${uri}`;
    return uri;
};

// ==========================================
// 🧱 1. ALBUM MESSAGE (Smart Grid Layout)
// ==========================================
export const AlbumMessage = React.memo(({ item, isMe, selectedIds, toggleSelect, openImage, selectionMode, dragSelectingRef, styles, colors }: any) => {
    const DISPLAY_LIMIT = 4;
    const count = item.length;
    const visibleItems = item.slice(0, DISPLAY_LIMIT);
    const overflowCount = count - DISPLAY_LIMIT;

    // Helper to determine style based on count and index
    const getImageStyle = (index: number) => {
        if (count === 2) {
            // UP/DOWN Stack for 2 images
            return styles.albumImageVerticalStack; 
        }
        if (count === 3) {
            // 1 Big Top, 2 Small Bottom
            return index === 0 ? styles.albumImageFull : styles.albumImageHalf;
        }
        // 4 or more: Grid
        return styles.albumImageHalf;
    };

    return (
        <View style={[
            styles.albumContainer, 
            { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
            isMe ? { alignSelf: 'flex-end', marginRight: 12 } : { alignSelf: 'flex-start', marginLeft: 12 }
        ]}>
            {visibleItems.map((m: any, i: number) => {
                const isSelected = selectedIds.has(m.client_id);
                const fullUrl = getMediaUri(m.media || m.content);
                const imageStyle = getImageStyle(i);

                return (
                    <TouchableOpacity 
                        key={m.client_id || i} 
                        activeOpacity={0.9}
                        onPress={() => selectionMode ? toggleSelect(m.client_id) : openImage(fullUrl)}
                        onLongPress={() => toggleSelect(m.client_id)}
                        // Drag selection logic
                        onPressIn={() => { if (selectionMode && dragSelectingRef && !dragSelectingRef.current) { dragSelectingRef.current = true; toggleSelect(m.client_id); } }}
                        onPressOut={() => { if(dragSelectingRef) dragSelectingRef.current = false; }}
                        style={[
                            imageStyle, 
                            { position: 'relative' },
                            isSelected && { borderWidth: 3, borderColor: colors.tint, borderRadius: 8 }
                        ]} 
                    >
                        <Image source={{ uri: fullUrl }} style={styles.albumImage} />
                        
                        {/* Overflow Counter (Only on the last visible item if there are more) */}
                        {(i === DISPLAY_LIMIT - 1 && overflowCount > 0) && (
                            <View style={styles.overflowOverlay}>
                                <Text style={styles.overflowText}>+{overflowCount}</Text>
                            </View>
                        )}
                        
                        {/* Selection Checkmark */}
                        {isSelected && (
                            <View style={styles.selectionTickContainer}>
                                <Ionicons name="checkmark-circle" size={24} color={colors.tint} />
                            </View>
                        )}
                    </TouchableOpacity>
                )
            })}
        </View>
    );
});

// ==========================================
// 🧱 2. STANDARD MESSAGE BUBBLE
// ==========================================
export const MessageBubble = React.memo(({ item, isMe, isSelected, toggleSelect, openImage, selectionMode, handleSendMedia, styles, colors }: any) => {
  if (item.content === "__DELETED__") return null;

  const mediaUri = getMediaUri(item.media || item.content);
  const isAudio = item.media_type === 'audio';
  const isMedia = item.media_type === 'image' || mediaUri.startsWith('file://') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(mediaUri);

  const renderTicks = () => {
    if (!isMe) return null;
    const iconName = item.status === 'read' || item.status === 'delivered' ? "checkmark-done" : item.status === 'sent' ? "checkmark" : "time-outline";
    const iconColor = item.status === 'read' ? (colors.isDark ? '#4dabf7' : '#0095f6') : "#ddd";
    return <Ionicons name={iconName as any} size={16} color={iconColor} />;
  };

  return (
    <View style={[styles.messageRow, isMe ? styles.messageRowRight : styles.messageRowLeft]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={() => toggleSelect(item.client_id)}
        onPress={() => selectionMode ? toggleSelect(item.client_id) : null}
      >
        <View style={[
            styles.bubble, 
            isMe ? { backgroundColor: colors.tint } : { backgroundColor: colors.isDark ? '#2c2c2e' : '#efefef' },
            isSelected && { borderWidth: 2, borderColor: colors.tint },
            isMedia && { padding: 4 } // Reduce padding for images
          ]}
        >
          {isAudio ? (
            <AudioPlayerBubble uri={mediaUri} isMe={isMe} colors={colors} />
          ) : isMedia ? (
             <View>
                <TouchableOpacity onPress={() => selectionMode ? toggleSelect(item.client_id) : openImage(mediaUri)}>
                    <Image source={{ uri: mediaUri }} style={styles.mediaImage} resizeMode="cover"/>
                </TouchableOpacity>
                {item.status === 'uploading' && <View style={styles.mediaOverlay}><ActivityIndicator color="#fff" size="small" /></View>}
                {(item.media_failed || item.status === 'failed') && (
                  <TouchableOpacity style={styles.mediaOverlay} onPress={() => handleSendMedia([{ uri: item.content } as any])}>
                      <Ionicons name="refresh" size={30} color="#fff" />
                  </TouchableOpacity>
                )}
             </View>
          ) : ( 
            <Text style={[styles.messageText, { color: isMe ? '#fff' : colors.text }]}>{item.content}</Text> 
          )}
          
          <View style={[styles.metaRow, isMedia && { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }]}>
            <Text style={[styles.timestamp, { color: (isMe || isMedia) ? 'rgba(255,255,255,0.9)' : colors.subText }]}>
                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isMe && <View style={{marginLeft: 4}}>{renderTicks()}</View>}
          </View>
          
          {isSelected && (
              <View style={styles.selectionTickContainer}>
                  <Ionicons name="checkmark-circle" size={24} color={colors.tint} />
              </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}, (prev, next) => {
  return (
    prev.item.client_id === next.item.client_id &&
    prev.item.status === next.item.status &&
    prev.item.content === next.item.content &&
    prev.item.media === next.item.media &&
    prev.isSelected === next.isSelected &&
    prev.selectionMode === next.selectionMode &&
    prev.colors.isDark === next.colors.isDark
  );
});

// ==========================================
// 🧱 3. MESSAGE LIST
// ==========================================
export const ChatMessageList = React.memo(({ groupedMessages, renderMessage, flatListRef, styles }: any) => {
  return (
    <FlatList 
      ref={flatListRef} 
      data={groupedMessages} 
      renderItem={renderMessage} 
      keyExtractor={(item) => item.map((m: any) => m.client_id).join('_')} 
      contentContainerStyle={styles.messagesList} 
      onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })} 
      onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })} 
      ListFooterComponent={<View style={{ height: 10 }} />} 
    />
  );
});