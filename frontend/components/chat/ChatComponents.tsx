import React, { useEffect, useRef, useState } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, Modal, StatusBar, Linking, StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BASE_URL } from '../../utils/api'; 
import { AudioPlayerBubble } from '../../components/AudioComponents';
import { getCachedFile } from '../../utils/mediaCache'; 

// DUMMY EXPORT TO SILENCE WARNINGS
export default function ComponentsRoute() { return null; }

const getMediaUri = (uri: string | null | undefined) => {
    if (!uri || typeof uri !== 'string' || uri.trim() === "") return null;
    if (uri.startsWith('http') || uri.startsWith('file://')) return uri;
    if (uri.startsWith('/media/')) return `${BASE_URL}${uri}`;
    return `${BASE_URL}${uri}`; 
};

// ==========================================
// NEW COMPONENT: CACHED IMAGE
// Handles downloading, caching, and displaying images smoothly.
// ==========================================
const CachedImage = React.memo(({ uri, style, resizeMode = 'cover' }: { uri: string | null, style: any, resizeMode?: any }) => {
    const [localUri, setLocalUri] = useState<string | null>(null);
  
    useEffect(() => {
      let isMounted = true;
      if (!uri) return;
  
      const loadCache = async () => {
        try {
            const cached = await getCachedFile(uri);
            if (isMounted) setLocalUri(cached);
        } catch (e) {
            if (isMounted) setLocalUri(uri);
        }
      };
  
      loadCache();
      return () => { isMounted = false; };
    }, [uri]);
  
    // Show gray placeholder while loading cache
    if (!localUri) {
      return <View style={[style, { backgroundColor: '#e0e0e0', borderRadius: style.borderRadius || 0 }]} />;
    }
  
    return <Image source={{ uri: localUri }} style={style} resizeMode={resizeMode} />;
});

// HELPER: Link Renderer
const renderTextWithLinks = (text: string, textColor: string, linkColor: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return (
        <Text style={{ fontSize: 15, marginBottom: 4, lineHeight: 20, color: textColor }}>
            {parts.map((part, index) => {
                if (part.match(urlRegex)) {
                    return (
                        <Text
                            key={index}
                            style={{ color: linkColor, textDecorationLine: 'underline', fontWeight: 'bold' }} 
                            onPress={() => Linking.openURL(part).catch(err => console.error("Couldn't load page", err))}
                        >
                            {part}
                        </Text>
                    );
                }
                return part;
            })}
        </Text>
    );
};

// ==========================================
//  LEVEL 2: ALBUM DETAIL MODAL (With Selection)
// ==========================================
export const AlbumDetailModal = ({ visible, onClose, images, initialIndex, onImagePress, selectedIds, toggleSelect, styles, colors }: any) => {
    const listRef = useRef<FlatList>(null);

    const isSelectionMode = selectedIds.size > 0;

    useEffect(() => {
        if (visible && images.length > 0 && initialIndex >= 0) {
            setTimeout(() => {
                listRef.current?.scrollToIndex({ index: initialIndex, animated: false, viewPosition: 0.5 });
            }, 100);
        }
    }, [visible, initialIndex, images]);

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose}>
            <View style={styles.albumModalContainer}>
                <StatusBar barStyle="light-content" backgroundColor="#000000" />
                
                <View style={styles.albumModalHeader}>
                    <TouchableOpacity onPress={onClose} style={styles.albumModalClose}>
                        <Ionicons name="arrow-back" size={28} color="#fff" />
                    </TouchableOpacity>
                    <Text style={{color:'#fff', fontWeight:'bold', fontSize:16, marginLeft: 20}}>
                        {isSelectionMode ? `${selectedIds.size} Selected` : "Album"}
                    </Text>
                </View>

                <FlatList
                    ref={listRef}
                    data={images}
                    keyExtractor={(_, i) => i.toString()} 
                    contentContainerStyle={styles.albumList}
                    getItemLayout={(_, index) => ({ length: styles.albumFeedImage.height + 20, offset: (styles.albumFeedImage.height + 20) * index, index })}
                    renderItem={({ item }) => {
                        const isSelected = selectedIds.has(item.client_id);
                        
                        return (
                            <TouchableOpacity 
                                activeOpacity={0.9} 
                                style={styles.albumFeedItem} 
                                onPress={() => {
                                    // If mode is active, Tap selects. Otherwise, Tap opens full screen.
                                    if (isSelectionMode) toggleSelect(item.client_id);
                                    else onImagePress(item.uri);
                                }}
                                onLongPress={() => toggleSelect(item.client_id)}
                            >
                                <CachedImage uri={item.uri} style={styles.albumFeedImage} />
                                
                                {isSelectionMode && (
                                    <View style={{
                                        position: 'absolute', top: 10, right: 10,
                                        width: 30, height: 30, borderRadius: 15,
                                        backgroundColor: isSelected ? colors.tint : 'rgba(0,0,0,0.5)',
                                        borderWidth: 2, borderColor: '#fff',
                                        justifyContent: 'center', alignItems: 'center'
                                    }}>
                                        {isSelected && <Ionicons name="checkmark" size={20} color="#fff" />}
                                    </View>
                                )}
                            </TouchableOpacity>
                        )
                    }}
                />
            </View>
        </Modal>
    );
};

// ==========================================
// 1. ALBUM MESSAGE (With Batch Selection)
// ==========================================
export const AlbumMessage = React.memo(({ item, isMe, selectedIds, toggleSelect, onSelectGroup, onOpenAlbum, selectionMode, dragSelectingRef, styles, colors }: any) => {
    const count = item.length;
    const DISPLAY_LIMIT = 4;
    const visibleItems = item.slice(0, DISPLAY_LIMIT);
    const overflowCount = count - DISPLAY_LIMIT;

    let containerStyle = styles.albumContainer;
    if (count === 2) containerStyle = [styles.albumContainer, styles.stackContainer];
    else if (count === 3) containerStyle = [styles.albumContainer, styles.triContainer];
    else containerStyle = [styles.albumContainer, styles.gridContainer];

    const getItemStyle = (index: number) => {
        if (count === 2) return index === 0 ? styles.stackItemTop : styles.stackItemBottom;
        if (count === 3) return index === 0 ? styles.triItemMain : [styles.triItemSmall, index === 1 ? { marginRight: '1%' } : {}];
        return [styles.gridItem, (index % 2 === 0) ? { marginRight: '1%' } : {}];
    };

    return (
        <View style={[ containerStyle, isMe ? { alignSelf: 'flex-end', marginRight: 12 } : { alignSelf: 'flex-start', marginLeft: 12 } ]}>
            {visibleItems.map((m: any, i: number) => {
                const isSelected = selectedIds.has(m.client_id);
                const fullUrl = getMediaUri(m.media || m.content);
                const itemStyle = getItemStyle(i);

                if (!fullUrl) return null;

                return (
                    <TouchableOpacity 
                        key={m.client_id || i} 
                        activeOpacity={0.9}
                        onPress={() => selectionMode ? toggleSelect(m.client_id) : onOpenAlbum(i)} 
                        onLongPress={() => onSelectGroup(item)} 
                        style={[ itemStyle, { position: 'relative' }, isSelected && { borderWidth: 3, borderColor: colors.tint, borderRadius: 8 } ]} 
                    >
                        <CachedImage uri={fullUrl} style={styles.albumImage} />
                        
                        {(i === DISPLAY_LIMIT - 1 && overflowCount > 0) && (
                            <View style={styles.overflowOverlay}><Text style={styles.overflowText}>+{overflowCount}</Text></View>
                        )}
                        {isSelected && <View style={styles.selectionTickContainer}><Ionicons name="checkmark-circle" size={24} color={colors.tint} /></View>}
                    </TouchableOpacity>
                )
            })}
        </View>
    );
});

// ==========================================
//  2. MESSAGE BUBBLE
// ==========================================
export const MessageBubble = React.memo(({ item, isMe, isSelected, toggleSelect, openImage, selectionMode, handleSendMedia, styles, colors }: any) => {
  if (item.content === "__DELETED__") return null;

  const mediaUri = getMediaUri(item.media || item.content);
  const isAudio = item.media_type === 'audio';
  const isMedia = (item.media_type === 'image' || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(item.content)) && !!mediaUri;

  const renderTicks = () => {
    if (!isMe) return null;
    const iconName = item.status === 'read' || item.status === 'delivered' ? "checkmark-done" : item.status === 'sent' ? "checkmark" : "time-outline";
    const iconColor = item.status === 'read' ? '#fff' : 'rgba(255,255,255,0.7)'; 
    return <Ionicons name={iconName as any} size={16} color={iconColor} />;
  };
  const myBackground = colors.isDark ?  '#2b225e': '#2e2a63';
  const theirBackground = colors.isDark ? '#2c2c2e' : '#efefef';
  const myLinkColor = colors.isDark ?  '#6aaeee': '#7ce6ee';
  const theirLinkColor = '#4dabf7'; 

  return (
    <View style={[styles.messageRow, isMe ? styles.messageRowRight : styles.messageRowLeft]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={() => toggleSelect(item.client_id)}
        onPress={() => selectionMode ? toggleSelect(item.client_id) : null}
        delayPressIn={100} 
      >
        <View style={[
            styles.bubble, 
            isMe ? { backgroundColor: myBackground } : { backgroundColor: theirBackground },
            isSelected && { borderWidth: 2, borderColor: colors.tint },
            isMedia && { padding: 4 }
          ]}
        >
          {isAudio ? (
            <AudioPlayerBubble uri={mediaUri || ""} isMe={isMe} colors={colors} />
          ) : isMedia ? (
             <View>
                {mediaUri ? (
                    <TouchableOpacity onPress={() => selectionMode ? toggleSelect(item.client_id) : openImage(mediaUri)}>
                        <CachedImage 
                            uri={mediaUri} 
                            style={{ width: 220, height: 220, borderRadius: 10 }} 
                            resizeMode="cover"
                        />
                    </TouchableOpacity>
                ) : (
                    <View style={{width: 220, height: 220, backgroundColor: '#ccc', borderRadius: 10, justifyContent: 'center', alignItems: 'center'}}>
                        <Ionicons name="image-outline" size={40} color="#666" />
                    </View>
                )}
                {item.status === 'uploading' && <View style={styles.mediaOverlay}><ActivityIndicator color="#fff" size="small" /></View>}
                {(item.media_failed || item.status === 'failed') && (
                  <TouchableOpacity style={styles.mediaOverlay} onPress={() => handleSendMedia([{ uri: item.content } as any])}>
                      <Ionicons name="refresh" size={30} color="#fff" />
                  </TouchableOpacity>
                )}
             </View>
          ) : ( 
            renderTextWithLinks(item.content, isMe ? '#fff' : colors.text, isMe ? myLinkColor : theirLinkColor)
          )}
          
          <View style={[styles.metaRow, isMedia && { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }]}>
            <Text style={[styles.timestamp, { color: (isMe || isMedia) ? 'rgba(255,255,255,0.9)' : colors.subText }]}>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            {isMe && <View style={{marginLeft: 4}}>{renderTicks()}</View>}
          </View>
          {isSelected && <View style={styles.selectionTickContainer}><Ionicons name="checkmark-circle" size={24} color={colors.tint} /></View>}
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