// socialconnect/frontend/hooks/useKeyboardHeight.ts
import { useEffect, useState } from 'react';
import { Keyboard, Platform, KeyboardEvent } from 'react-native';

export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // iOS handles itself via KeyboardAvoidingView, so we only track Android here.
    if (Platform.OS !== 'android') return;

    const onShow = (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
    };

    const onHide = () => {
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener('keyboardDidShow', onShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return keyboardHeight;
}