import * as FileSystem from 'expo-file-system/legacy';
// SDK 57's root saveToLibraryAsync throws; the legacy API supports add-only saves.
import * as MediaLibrary from 'expo-media-library/legacy';

export class PhotosPermissionError extends Error {
  constructor(public readonly canAskAgain: boolean) {
    super(canAskAgain
      ? 'Photo permission was not granted. Tap Save to Photos to try again. You can still share your art.'
      : 'Photo permission is blocked. Open Settings to allow saving photos, then try again. You can still share your art.');
    this.name = 'PhotosPermissionError';
  }
}

/** Saves the existing PNG/GIF without regenerating, moving, or deleting it. */
export async function saveExportToPhotos(uri: string): Promise<void> {
  const file = await FileSystem.getInfoAsync(uri);
  if (!file.exists) {
    throw new Error('This export is no longer on your device. Choose a photo and export it again.');
  }
  // No read scopes are needed to add files. Android Expo Go rejects explicit
  // photo/video scopes even with writeOnly=true, so use an empty scope list.
  // Older Android still requests storage-write permission; iOS uses add-only.
  let permission = await MediaLibrary.getPermissionsAsync(true, []);
  if (!permission.granted && permission.canAskAgain) {
    permission = await MediaLibrary.requestPermissionsAsync(true, []);
  }
  if (!permission.granted) {
    throw new PhotosPermissionError(permission.canAskAgain);
  }
  await MediaLibrary.saveToLibraryAsync(uri);
}
