import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageSourcePropType,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  decodeJpeg,
  encodeGifBase64,
  encodePngBase64,
  pixelate,
  type RgbaImage,
} from '@/lib/pixel-art';

const HISTORY_KEY = 'pixel-pop:recent-v1';
const CELL_MIN = 6;
const CELL_MAX = 42;
const PREVIEW_MAX_SIDE = 1024;

type ExportFormat = 'png' | 'gif';
type RecentCreation = {
  id: string;
  uri: string;
  format: ExportFormat;
  createdAt: number;
};

type Sample = {
  title: string;
  image: ImageSourcePropType;
};

const SAMPLES: Sample[] = [
  { title: 'Window cat', image: require('../assets/images/demo-cat.png') },
  { title: 'Coastal day', image: require('../assets/images/demo-coast.png') },
];

function resizeActions(width: number, height: number) {
  const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(width, height));
  return [
    {
      resize: {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      },
    },
  ];
}

export default function PixelArtHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const originalRef = useRef<RgbaImage | null>(null);
  const processedRef = useRef<RgbaImage | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [selectedSavedUri, setSelectedSavedUri] = useState<string | null>(null);
  const [imageName, setImageName] = useState('Window cat');
  const [pixelSize, setPixelSize] = useState(18);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState('');
  const [recent, setRecent] = useState<RecentCreation[]>([]);

  const createPreview = useCallback((source: RgbaImage, nextPixelSize: number) => {
    const result = pixelate(source, nextPixelSize);
    processedRef.current = result;
    setPreviewUri(`data:image/png;base64,${encodePngBase64(result)}`);
    setIsDirty(false);
    setSelectedSavedUri(null);
  }, []);

  const loadImage = useCallback(
    async (uri: string, title: string, dimensions?: { width: number; height: number }) => {
      setIsLoading(true);
      setStatus('');
      setSelectedSavedUri(null);
      try {
        const info = dimensions ?? (await ImageManipulator.manipulateAsync(uri, [], { base64: false }));
        const manipulated = await ImageManipulator.manipulateAsync(
          uri,
          resizeActions(info.width, info.height),
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        if (!manipulated.base64) {
          throw new Error('This photo could not be prepared. Try another image.');
        }
        const decoded = decodeJpeg(manipulated.base64);
        originalRef.current = decoded;
        setSelectedUri(uri);
        setImageName(title);
        createPreview(decoded, pixelSize);
        await Haptics.selectionAsync();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The photo could not be opened.';
        setStatus(message);
        Alert.alert('Could not open photo', message);
      } finally {
        setIsLoading(false);
      }
    },
    [createPreview, pixelSize],
  );

  const loadSample = useCallback(
    async (sample: Sample) => {
      const moduleId = Image.resolveAssetSource(sample.image);
      if (!moduleId?.uri) {
        setStatus('The sample image is unavailable. Choose a photo from your library instead.');
        return;
      }
      await loadImage(moduleId.uri, sample.title);
    },
    [loadImage],
  );

  useEffect(() => {
    const firstSample = Image.resolveAssetSource(SAMPLES[0]!.image);
    if (firstSample?.uri) void loadImage(firstSample.uri, SAMPLES[0]!.title);
    void AsyncStorage.getItem(HISTORY_KEY)
      .then((value) => {
        if (value) setRecent(JSON.parse(value) as RecentCreation[]);
      })
      .catch(() => setStatus('Your recent creations could not be loaded.'));
  }, [loadImage]);

  const choosePhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await loadImage(asset.uri, asset.fileName?.replace(/\.[^.]+$/, '') || 'My photo', {
      width: asset.width,
      height: asset.height,
    });
  }, [loadImage]);

  const adjustPixelSize = (change: number) => {
    const nextValue = Math.max(CELL_MIN, Math.min(CELL_MAX, pixelSize + change));
    setPixelSize(nextValue);
    setIsDirty(true);
    setSelectedSavedUri(null);
  };

  const applyPixelSize = async () => {
    const original = originalRef.current;
    if (!original) return;
    setIsLoading(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    try {
      createPreview(original, pixelSize);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } finally {
      setIsLoading(false);
    }
  };

  const shareUri = async (uri: string, selectedFormat: ExportFormat) => {
    if (Platform.OS === 'web') {
      const webNavigator = globalThis.navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      const response = await fetch(uri);
      const blob = await response.blob();
      const file = new File([blob], `pixel-pop.${selectedFormat}`, {
        type: selectedFormat === 'gif' ? 'image/gif' : 'image/png',
      });
      if (webNavigator.share && webNavigator.canShare?.({ files: [file] })) {
        await webNavigator.share({ files: [file], title: 'PixelPop' });
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `pixel-pop.${selectedFormat}`;
        link.click();
        URL.revokeObjectURL(link.href);
      }
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Sharing is not available on this device.');
    }
    await Sharing.shareAsync(uri, {
      dialogTitle: 'Share your pixel art',
      mimeType: selectedFormat === 'gif' ? 'image/gif' : 'image/png',
      UTI: selectedFormat === 'gif' ? 'com.compuserve.gif' : 'public.png',
    });
  };

  const exportAndShare = async () => {
    if (selectedSavedUri) {
      try {
        setIsExporting(true);
        await shareUri(selectedSavedUri, format);
      } catch (error) {
        Alert.alert('Could not share', error instanceof Error ? error.message : 'Try again.');
      } finally {
        setIsExporting(false);
      }
      return;
    }

    const pixels = processedRef.current;
    if (!pixels) {
      setStatus('Choose a photo before exporting.');
      return;
    }
    setIsExporting(true);
    setStatus('');
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const base64 = format === 'gif' ? encodeGifBase64(pixels) : encodePngBase64(pixels);
      const mimeType = format === 'gif' ? 'image/gif' : 'image/png';
      let uri: string;

      if (Platform.OS === 'web') {
        uri = `data:${mimeType};base64,${base64}`;
      } else {
        const folder = `${FileSystem.documentDirectory}PixelPop/`;
        await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
        const filename = `pixel-pop-${Date.now()}.${format}`;
        uri = `${folder}${filename}`;
        await FileSystem.writeAsStringAsync(uri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const newCreation: RecentCreation = {
          id: `${Date.now()}`,
          uri,
          format,
          createdAt: Date.now(),
        };
        const updated = [newCreation, ...recent].slice(0, 12);
        setRecent(updated);
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      }
      await shareUri(uri, format);
      setStatus(format === 'gif' ? 'GIF exported and ready to share.' : 'PNG exported and ready to share.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try exporting again.';
      setStatus(message);
      Alert.alert('Export failed', message);
    } finally {
      setIsExporting(false);
    }
  };

  const selectRecent = (item: RecentCreation) => {
    originalRef.current = null;
    processedRef.current = null;
    setSelectedSavedUri(item.uri);
    setSelectedUri(item.uri);
    setPreviewUri(item.uri);
    setImageName('Recent creation');
    setFormat(item.format);
    setIsDirty(false);
  };

  const styles = makeStyles(colors);
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + webTopInset }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, webBottomInset) + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <View style={styles.markPixel} />
              <View style={styles.markPixelSmall} />
              <View style={styles.markPixel} />
            </View>
            <Text style={styles.brandName}>pixelpop</Text>
          </View>
          <View style={styles.privateBadge}>
            <View style={styles.privateDot} />
            <Text style={styles.privateText}>ON DEVICE</Text>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>YOUR PHOTOS, IN PIXELS</Text>
          <Text style={styles.headline}>Make a little{'\n'}pixel magic.</Text>
          <Text style={styles.subtitle}>Turn any photo into a tiny work of art.</Text>
        </View>

        <View style={styles.previewCard}>
          <View style={styles.previewImageWrap}>
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={styles.previewImage}
                resizeMode="contain"
                accessibilityLabel={`${imageName} pixel art preview`}
              />
            ) : (
              <View style={styles.emptyPreview}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="images-outline" size={30} color={colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>Your canvas is ready</Text>
                <Text style={styles.emptySubtitle}>Pick a photo to see the pixel magic.</Text>
              </View>
            )}
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Making pixels…</Text>
              </View>
            )}
            {previewUri && (
              <View style={styles.previewTag}>
                <View style={styles.previewDot} />
                <Text style={styles.previewTagText}>LIVE PREVIEW</Text>
              </View>
            )}
          </View>
          <View style={styles.previewFooter}>
            <View style={styles.photoNameWrap}>
              <Text style={styles.photoLabel}>CURRENT CANVAS</Text>
              <Text style={styles.photoName} numberOfLines={1}>{imageName}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose a photo"
              testID="choose-photo"
              onPress={() => void choosePhoto()}
              style={({ pressed }) => [styles.changePhotoButton, pressed && styles.pressed]}
            >
              <Feather name="image" size={17} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        <View style={styles.sampleRow}>
          <Text style={styles.sectionLabel}>TRY A SAMPLE</Text>
          <View style={styles.samples}>
            {SAMPLES.map((sample) => (
              <Pressable
                key={sample.title}
                accessibilityRole="button"
                accessibilityLabel={`Try ${sample.title} sample`}
                testID={`sample-${sample.title.toLowerCase().replaceAll(' ', '-')}`}
                onPress={() => void loadSample(sample)}
                style={({ pressed }) => [styles.sampleButton, pressed && styles.pressed]}
              >
                <Image source={sample.image} style={styles.sampleImage} />
                <Text style={styles.sampleText}>{sample.title}</Text>
                <Feather name="arrow-up-right" size={14} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.editorCard}>
          <View style={styles.editorHeading}>
            <View>
              <Text style={styles.sectionLabel}>MAKE IT YOURS</Text>
              <Text style={styles.editorTitle}>Pixel size</Text>
            </View>
            <View style={styles.sizePill}>
              <Text style={styles.sizeNumber}>{pixelSize}</Text>
              <Text style={styles.sizeUnit}>px</Text>
            </View>
          </View>
          <View style={styles.adjuster}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Make pixels finer"
              testID="pixel-size-decrease"
              onPress={() => adjustPixelSize(-3)}
              disabled={pixelSize <= CELL_MIN}
              style={({ pressed }) => [
                styles.adjustButton,
                pressed && styles.pressed,
                pixelSize <= CELL_MIN && styles.disabledButton,
              ]}
            >
              <Feather name="minus" size={17} color={colors.foreground} />
            </Pressable>
            <View style={styles.pixelTrackWrap}>
              <View style={styles.pixelTrack}>
                <View
                  style={[
                    styles.pixelTrackFill,
                    { width: `${((pixelSize - CELL_MIN) / (CELL_MAX - CELL_MIN)) * 100}%` },
                  ]}
                />
                <View
                  style={[
                    styles.pixelThumb,
                    { left: `${((pixelSize - CELL_MIN) / (CELL_MAX - CELL_MIN)) * 100}%` },
                  ]}
                />
              </View>
              <View style={styles.scaleLabels}>
                <Text style={styles.scaleLabel}>FINE</Text>
                <Text style={styles.scaleLabel}>CHUNKY</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Make pixels chunkier"
              testID="pixel-size-increase"
              onPress={() => adjustPixelSize(3)}
              disabled={pixelSize >= CELL_MAX}
              style={({ pressed }) => [
                styles.adjustButton,
                pressed && styles.pressed,
                pixelSize >= CELL_MAX && styles.disabledButton,
              ]}
            >
              <Feather name="plus" size={17} color={colors.foreground} />
            </Pressable>
          </View>
          <View style={styles.formatRow}>
            <View>
              <Text style={styles.sectionLabel}>EXPORT AS</Text>
              <Text style={styles.formatHint}>Ready for your group chat</Text>
            </View>
            <View style={styles.formatSwitch}>
              {(['png', 'gif'] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: format === value }}
                  testID={`format-${value}`}
                  onPress={() => {
                    setFormat(value);
                    setSelectedSavedUri(null);
                  }}
                  style={[styles.formatOption, format === value && styles.formatOptionActive]}
                >
                  <Text style={[styles.formatText, format === value && styles.formatTextActive]}>
                    {value.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {isDirty && (
          <Pressable
            accessibilityRole="button"
            testID="apply-pixel-size"
            onPress={() => void applyPixelSize()}
            style={({ pressed }) => [styles.updateButton, pressed && styles.pressed]}
          >
            <Feather name="refresh-cw" size={16} color={colors.primaryForeground} />
            <Text style={styles.updateText}>Update preview</Text>
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={format === 'gif' ? 'Export and share GIF' : 'Export and share PNG'}
          testID="export-share"
          onPress={() => void exportAndShare()}
          disabled={isLoading || isExporting || !previewUri}
          style={({ pressed }) => [
            styles.exportButton,
            pressed && styles.pressed,
            (isLoading || isExporting || !previewUri) && styles.disabledExport,
          ]}
        >
          {isExporting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Feather name="send" size={18} color={colors.primaryForeground} />
          )}
          <Text style={styles.exportText}>
            {isExporting ? 'Preparing your art…' : `Export & share ${format.toUpperCase()}`}
          </Text>
          {!isExporting && <Feather name="arrow-up-right" size={17} color={colors.primaryForeground} />}
        </Pressable>

        {status ? <Text accessibilityRole="alert" style={styles.status}>{status}</Text> : null}

        {recent.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.recentHeading}>
              <Text style={styles.sectionLabel}>SAVED ON THIS DEVICE</Text>
              <Text style={styles.recentCount}>{recent.length} / 12</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentList}>
              {recent.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open recent ${item.format.toUpperCase()} creation`}
                  testID={`recent-${item.id}`}
                  onPress={() => selectRecent(item)}
                  style={({ pressed }) => [styles.recentItem, pressed && styles.pressed]}
                >
                  <Image source={{ uri: item.uri }} style={styles.recentImage} />
                  <View style={styles.recentFormat}>
                    <Text style={styles.recentFormatText}>{item.format.toUpperCase()}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.privacyNote}>
          <Feather name="lock" size={13} color={colors.mutedForeground} />
          <Text style={styles.privacyText}>Your photos stay on your device.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 22, paddingTop: 10 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30 },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    brandMark: {
      width: 28,
      height: 28,
      borderRadius: 9,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 2,
      transform: [{ rotate: '-6deg' }],
    },
    markPixel: { width: 5, height: 11, borderRadius: 1, backgroundColor: colors.primaryForeground },
    markPixelSmall: { width: 5, height: 6, borderRadius: 1, backgroundColor: '#FFD789' },
    brandName: { color: colors.foreground, fontSize: 20, fontWeight: '800', letterSpacing: -0.8 },
    privateBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 30,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    privateDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: colors.success },
    privateText: { color: colors.mutedForeground, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
    intro: { marginBottom: 21 },
    eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.7, marginBottom: 9 },
    headline: { color: colors.foreground, fontSize: 38, lineHeight: 40, fontWeight: '800', letterSpacing: -1.8 },
    subtitle: { color: colors.mutedForeground, fontSize: 14, lineHeight: 20, marginTop: 9 },
    previewCard: {
      overflow: 'hidden',
      borderRadius: 24,
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      marginBottom: 21,
    },
    previewImageWrap: {
      aspectRatio: 1.15,
      minHeight: 230,
      maxHeight: 340,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.preview,
      overflow: 'hidden',
    },
    previewImage: { width: '100%', height: '100%' },
    emptyPreview: { alignItems: 'center', padding: 28 },
    emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.surfaceAccent, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    emptyTitle: { color: colors.foreground, fontSize: 17, fontWeight: '700', marginBottom: 5 },
    emptySubtitle: { color: colors.mutedForeground, fontSize: 13, textAlign: 'center' },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: `${colors.background}CC`, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { color: colors.foreground, fontSize: 13, fontWeight: '600' },
    previewTag: {
      position: 'absolute',
      top: 13,
      left: 13,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.background,
    },
    previewDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: colors.success },
    previewTagText: { color: colors.foreground, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
    previewFooter: { padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    photoNameWrap: { flex: 1, paddingRight: 12 },
    photoLabel: { color: colors.mutedForeground, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
    photoName: { color: colors.foreground, fontSize: 15, fontWeight: '700', marginTop: 4 },
    changePhotoButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surfaceAccent, alignItems: 'center', justifyContent: 'center' },
    sampleRow: { marginBottom: 22 },
    sectionLabel: { color: colors.mutedForeground, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
    samples: { flexDirection: 'row', gap: 9, marginTop: 10 },
    sampleButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 7,
      minWidth: 0,
      borderRadius: 14,
      borderColor: colors.border,
      borderWidth: 1,
      backgroundColor: colors.card,
    },
    sampleImage: { width: 34, height: 34, borderRadius: 9 },
    sampleText: { flex: 1, color: colors.foreground, fontSize: 11, fontWeight: '700' },
    editorCard: {
      padding: 17,
      borderRadius: 22,
      borderColor: colors.border,
      borderWidth: 1,
      backgroundColor: colors.card,
      marginBottom: 14,
    },
    editorHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    editorTitle: { color: colors.foreground, fontSize: 18, fontWeight: '700', marginTop: 5 },
    sizePill: { flexDirection: 'row', alignItems: 'baseline', gap: 3, backgroundColor: colors.surfaceAccent, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 7 },
    sizeNumber: { color: colors.foreground, fontSize: 17, fontWeight: '800' },
    sizeUnit: { color: colors.mutedForeground, fontSize: 10, fontWeight: '700' },
    adjuster: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 15, marginBottom: 19 },
    adjustButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.surfaceAccent, alignItems: 'center', justifyContent: 'center' },
    disabledButton: { opacity: 0.4 },
    pixelTrackWrap: { flex: 1, paddingTop: 4 },
    pixelTrack: { height: 5, borderRadius: 5, backgroundColor: colors.border, justifyContent: 'center' },
    pixelTrackFill: { position: 'absolute', left: 0, height: 5, borderRadius: 5, backgroundColor: colors.primary },
    pixelThumb: { position: 'absolute', width: 16, height: 16, borderRadius: 9, marginLeft: -8, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.card },
    scaleLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    scaleLabel: { color: colors.mutedForeground, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
    formatRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    formatHint: { color: colors.mutedForeground, fontSize: 11, marginTop: 5 },
    formatSwitch: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: colors.surfaceAccent },
    formatOption: { borderRadius: 9, minWidth: 46, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
    formatOptionActive: { backgroundColor: colors.foreground },
    formatText: { color: colors.mutedForeground, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
    formatTextActive: { color: colors.card },
    updateButton: { borderRadius: 15, backgroundColor: colors.secondary, minHeight: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, marginBottom: 11 },
    updateText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '700' },
    exportButton: { borderRadius: 16, backgroundColor: colors.primary, minHeight: 56, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 11 },
    exportText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '800', flex: 1 },
    disabledExport: { opacity: 0.55 },
    status: { color: colors.mutedForeground, fontSize: 12, textAlign: 'center', marginVertical: 5, lineHeight: 18 },
    recentSection: { marginTop: 24 },
    recentHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 },
    recentCount: { color: colors.mutedForeground, fontSize: 10, fontWeight: '600' },
    recentList: { gap: 10, paddingBottom: 3 },
    recentItem: { width: 84, height: 84, borderRadius: 15, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    recentImage: { width: '100%', height: '100%' },
    recentFormat: { position: 'absolute', right: 5, bottom: 5, backgroundColor: colors.background, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 3 },
    recentFormatText: { color: colors.foreground, fontSize: 8, fontWeight: '800' },
    privacyNote: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 23 },
    privacyText: { color: colors.mutedForeground, fontSize: 11, fontWeight: '500' },
    pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
  });
}
