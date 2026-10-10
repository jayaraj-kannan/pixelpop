import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { GifEffect, GifOptions } from '@/src/lib/pixel-art';

const EFFECTS: { value: GifEffect; label: string; description: string }[] = [
  { value: 'pulse', label: 'Color pulse', description: 'A looping change in brightness and warmth.' },
  { value: 'bounce', label: 'Bounce', description: 'Move the photo up and down.' },
  { value: 'sway', label: 'Sway', description: 'Move the photo from side to side.' },
  { value: 'zoom', label: 'Zoom', description: 'Zoom in, then back out.' },
  { value: 'wobble', label: 'Wobble', description: 'Rock the photo left and right.' },
];

export function GifControls({
  value, disabled, onChange,
}: {
  value: GifOptions;
  disabled: boolean;
  onChange: (value: GifOptions) => void;
}) {
  const colors = useColors();
  const styles = makeStyles(colors);
  const selected = EFFECTS.find((effect) => effect.value === value.effect)!;
  return (
    <View style={styles.card} testID="gif-animation-controls">
      <Text style={styles.heading}>GIF ANIMATION</Text>
      <Text style={styles.subtitle}>Choose how your photo moves</Text>
      <View style={styles.effects}>
        {EFFECTS.map((effect) => (
          <Pressable
            key={effect.value}
            testID={`gif-effect-${effect.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected: value.effect === effect.value, disabled }}
            onPress={() => onChange({ ...value, effect: effect.value })}
            disabled={disabled}
            style={({ pressed }) => [
              styles.choice,
              value.effect === effect.value && styles.active,
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <Text style={[styles.choiceText, value.effect === effect.value && styles.activeText]}>
              {effect.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.description}>{selected.description}</Text>
      {(['speed', 'strength'] as const).map((setting) => (
        <View key={setting} style={styles.row}>
          <Text style={styles.label}>{setting === 'speed' ? 'Speed' : 'Strength'}</Text>
          <View style={styles.segments}>
            {(setting === 'speed'
              ? ['slow', 'normal', 'fast'] as const
              : ['gentle', 'normal', 'bold'] as const
            ).map((option) => (
              <Pressable
                key={option}
                testID={`gif-${setting}-${option}`}
                accessibilityRole="button"
                accessibilityLabel={`${setting}: ${option}`}
                accessibilityState={{ selected: value[setting] === option, disabled }}
                disabled={disabled}
                onPress={() => onChange({ ...value, [setting]: option } as GifOptions)}
                style={({ pressed }) => [
                  styles.segment,
                  value[setting] === option && styles.active,
                  pressed && styles.pressed,
                  disabled && styles.disabled,
                ]}
              >
                <Text style={[styles.choiceText, value[setting] === option && styles.activeText]}>
                  {option[0]!.toUpperCase() + option.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Text style={styles.note}>Preview updates automatically. Photos crop to fill the frame; cutouts keep transparent backgrounds.</Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 12, marginBottom: 16 },
    heading: { color: colors.foreground, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    subtitle: { color: colors.mutedForeground, fontSize: 13 },
    effects: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    choice: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, backgroundColor: colors.surfaceAccent },
    choiceText: { color: colors.foreground, fontSize: 12, fontWeight: '700' },
    active: { backgroundColor: colors.foreground },
    activeText: { color: colors.card },
    description: { color: colors.mutedForeground, fontSize: 12, lineHeight: 18 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    label: { color: colors.foreground, fontSize: 12, fontWeight: '700' },
    segments: { flexDirection: 'row', padding: 3, backgroundColor: colors.surfaceAccent, borderRadius: 12 },
    segment: { paddingHorizontal: 10, paddingVertical: 10, borderRadius: 9 },
    note: { color: colors.mutedForeground, fontSize: 11, lineHeight: 17 },
    pressed: { opacity: 0.75 },
    disabled: { opacity: 0.5 },
  });
}
