import { Alert, Platform } from 'react-native';

// react-native-web's Alert.alert() is a no-op stub in this project's version —
// it never shows anything and never calls the button's onPress, so every
// "Are you sure?" dialog built on it silently did nothing on web. Route
// through window.confirm there instead; native keeps using the real Alert.
export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
