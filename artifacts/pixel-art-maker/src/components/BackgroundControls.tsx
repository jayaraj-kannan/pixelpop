import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export function TransparencyGrid() {
  const colors = useColors();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="transparency" patternUnits="userSpaceOnUse" width={24} height={24}>
            <Rect width={24} height={24} fill={colors.card} />
            <Rect width={12} height={12} fill={colors.surfaceAccent} />
            <Rect x={12} y={12} width={12} height={12} fill={colors.surfaceAccent} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#transparency)" />
      </Svg>
    </View>
  );
}

export function BackgroundControls({
  removed, busy, disabled, onPress,
}: {
  removed: boolean;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = StyleSheet.create({
    card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 14, gap: 10 },
    heading: { color: colors.foreground, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    description: { color: colors.mutedForeground, fontSize: 12, lineHeight: 18 },
    button: { flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', minHeight: 46, backgroundColor: colors.foreground, borderRadius: 12 },
    buttonText: { color: colors.card, fontSize: 13, fontWeight: '700' },
    notice: { color: colors.mutedForeground, fontSize: 11, lineHeight: 17 },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.75 },
  });
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>FOCUS ON THE SUBJECT</Text>
      <Text style={styles.description}>
        {removed
          ? 'Background removed. PNG and GIF exports keep the transparent areas.'
          : 'Gemini Nano Banana isolates the main subject from your photo.'}
      </Text>
      <Pressable
        testID={removed ? 'restore-background' : 'remove-background'}
        accessibilityRole="button"
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}
      >
        {busy ? <ActivityIndicator color={colors.card} />
          : <Feather name={removed ? 'rotate-ccw' : 'scissors'} size={17} color={colors.card} />}
        <Text style={styles.buttonText}>
          {busy ? 'Removing background…' : removed ? 'Restore background' : 'Remove background'}
        </Text>
      </Pressable>
      <Text style={styles.notice}>
        {removed
          ? 'Check fine edges before sharing. Restore uses your original photo without another AI request.'
          : 'This action sends your selected photo to Gemini. Usage is charged to your Google API account.'}
      </Text>
    </View>
  );
}
