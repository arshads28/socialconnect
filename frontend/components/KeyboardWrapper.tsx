import React, { ReactNode } from 'react';
import { 
  KeyboardAvoidingView, 
  Platform, 
  StyleSheet, 
  View 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

interface KeyboardWrapperProps {
  children: ReactNode;
  headerHeight?: number; 
}

export default function KeyboardWrapper({ children, headerHeight = 0 }: KeyboardWrapperProps) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  // 🔹 ANDROID FIX
  // We use the FULL keyboard height for the spacer.
  // We do NOT subtract insets.bottom anymore, because on some devices (with nav bars),
  // this causes the spacer to be too small, hiding the text.
  if (Platform.OS === 'android') {
    return (
      <View style={styles.container}>
        {children}
        <View style={{ height: keyboardHeight + 20 }} />
      </View>
    );
  }

  // 🔹 iOS FIX
  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior="padding"
      keyboardVerticalOffset={insets.top + headerHeight}
      contentContainerStyle={{ flex: 1 }}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});