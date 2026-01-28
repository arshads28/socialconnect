import React, { useEffect, useRef } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, Modal, StatusBar, Linking 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BASE_URL } from '../../utils/api'; 
import { AudioPlayerBubble } from '../../components/AudioComponents';

const getMediaUri = (uri: string | null | undefined) => {
    if (!uri || typeof uri !== 'string' || uri.trim() === "") return null;
    if (uri.startsWith('http') || uri.startsWith('file://')) return uri;
    if (uri.startsWith('/media/')) return `${BASE_URL}${uri}`;
    return `${BASE_URL}${uri}`; 
};

//  HELPER: Parse Text & Make Links Clickable
const renderTextWithLinks = (text: string, color: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return (
        <Text style={{ fontSize: 15, marginBottom: 4, lineHeight: 20, color }}>
            {parts.map((part, index) => {
                if (part.match(urlRegex)) {
                    return (
                        <Text
                            key={index}
                            style={{ color: '#4dabf7', textDecorationLine: 'underline' }} // Link Style
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

// ALBUM DETAIL MODAL
export const AlbumDetailModal = ({ visible, onClose, images, initialIndex, onImagePress, styles }: any) => {
    const listRef = useRef<FlatList>(null);

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
                </View>

                <FlatList
                    ref={listRef}
                    data={images}
                    keyExtractor={(_, i) => i.toString()}
                    contentContainerStyle={styles.albumList}
                    getItemLayout={(_, index) => ({ length: styles.albumFeedImage.height + 20, offset: (styles.albumFeedImage.height + 20) * index, index })}
                    renderItem={({ item, index }) => (
                        <TouchableOpacity 
                            activeOpacity={1} 
                            style={styles.albumFeedItem} 
                            onPress={() => onImagePress(item.uri)} 
                        >
                            <Image source={{ uri: item.uri }} style={styles.albumFeedImage} />
                        </TouchableOpacity>
                    )}
                />
            </View>
        </Modal>
    );
};


//  ALBUM MESSAGE (Smart Layouts)
export const AlbumMessage = React.memo(({ item, isMe, selectedIds, toggleSelect, onOpenAlbum, selectionMode, dragSelectingRef, styles, colors }: any) => {
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
                        onLongPress={() => toggleSelect(m.client_id)}
                        onPressIn={() => { if (selectionMode && dragSelectingRef && !dragSelectingRef.current) { dragSelectingRef.current = true; toggleSelect(m.client_id); } }}
                        onPressOut={() => { if(dragSelectingRef) dragSelectingRef.current = false; }}
                        style={[ itemStyle, { position: 'relative' }, isSelected && { borderWidth: 3, borderColor: colors.tint, borderRadius: 8 } ]} 
                    >
                        <Image source={{ uri: fullUrl }} style={styles.albumImage} />
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

// SINGLE MESSAGE BUBBLE
export const MessageBubble = React.memo(({ item, isMe, isSelected, toggleSelect, openImage, selectionMode, handleSendMedia, styles, colors }: any) => {
  if (item.content === "__DELETED__") return null;

  const mediaUri = getMediaUri(item.media || item.content);
  const isAudio = item.media_type === 'audio';
  const isMedia = (item.media_type === 'image' || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(item.content)) && !!mediaUri;

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
        delayPressIn={100} // slight delay to prevent accidental selection when scrolling
      >
        <View style={[
            styles.bubble, 
            isMe ? { backgroundColor: colors.tint } : { backgroundColor: colors.isDark ? '#2c2c2e' : '#efefef' },
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
                        <Image source={{ uri: mediaUri }} style={{ width: 220, height: 220, borderRadius: 10 }} resizeMode="cover"/>
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
            renderTextWithLinks(item.content, isMe ? '#fff' : colors.text)
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