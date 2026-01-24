import React, { ReactNode } from 'react';
import { 
  KeyboardAvoidingView, 
  Platform, 
  StyleSheet,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface KeyboardWrapperProps {
  children: ReactNode;
  headerHeight?: number; 
}

export default function KeyboardWrapper({ children, headerHeight = 0 }: KeyboardWrapperProps) {
  const insets = useSafeAreaInsets();

  //  ANDROID FIX: 
  // Android natively resizes the screen perfectly because of app.json. 
  // If we use KeyboardAvoidingView here, it causes the "1cm float" bug.
  if (Platform.OS === 'android') {
    return <View style={styles.container}>{children}</View>;
  }

  //  iOS FIX:
  // iOS needs KeyboardAvoidingView to push the content up.
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