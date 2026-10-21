/** 所选照片的位置兜底。只查照片资产及地名权限，从不读取手机当前坐标。 */
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as LegacyMediaLibrary from 'expo-media-library/legacy';
import { PermissionsAndroid, Platform } from 'react-native';
import { readExifGps } from './exifGps';
import type { PhotoGps } from './exifGps';

/** Android 的系统反查要求前台定位授权，即使输入是老照片自己的 EXIF 坐标。 */
export async function canReverseGeocodeImportedPhoto(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    return permission.granted;
  } catch (error) {
    console.warn('[retro-film-cam] 导入照片的地名反查权限检查失败：', error);
    return false;
  }
}

/** 一批导入只问一次相册读取权限；仅在原 EXIF 缺 GPS 时补读所选资产的位置。 */
export function createPhotoAssetGpsReader(): (assetId: string | null | undefined) => Promise<PhotoGps | null> {
  let access: Promise<boolean> | null = null;
  return async (assetId) => {
    if (!assetId) return null;
    if (Platform.OS === 'android' && !/^\d+$/.test(assetId)) return null;
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
    try {
      access ??= (async () => {
        if (Platform.OS === 'ios') {
          let permission = await MediaLibrary.getPermissionsAsync(false);
          if (!permission.granted && permission.accessPrivileges !== 'limited' && permission.canAskAgain) {
            permission = await MediaLibrary.requestPermissionsAsync(false);
          }
          return permission.granted || permission.accessPrivileges === 'limited';
        }
        // Scoped storage 隐去图片的 GPS。旧版 Expo MediaLibrary 原生路径会用
        // MediaStore.setRequireOriginal()；新版 Asset.getLocation() 目前只读普通 URI。
        const needsMediaLocation = Number(Platform.Version) >= 29;
        const hasMediaLocation = async () => !needsMediaLocation ||
          PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION);
        let permission = await LegacyMediaLibrary.getPermissionsAsync(false, ['photo']);
        let canReadPhoto = permission.granted || permission.accessPrivileges === 'limited';
        if ((!canReadPhoto || !(await hasMediaLocation())) && permission.canAskAgain) {
          permission = await LegacyMediaLibrary.requestPermissionsAsync(false, ['photo']);
          canReadPhoto = permission.granted || permission.accessPrivileges === 'limited';
        }
        return canReadPhoto && await hasMediaLocation();
      })().catch((error) => {
        console.warn('[retro-film-cam] 未能检查照片库读取权限：', error);
        return false;
      });
      if (!(await access)) return null;
      let location: { latitude: number; longitude: number } | null | undefined;
      if (Platform.OS === 'ios') {
        // ImagePickerAsset.assetId 是 PHAsset.localIdentifier；SDK 57 的 Asset 构造器要 ph:// URI。
        const mediaId = assetId.startsWith('ph://') ? assetId : `ph://${assetId}`;
        location = await new MediaLibrary.Asset(mediaId).getLocation();
      } else {
        // Android ImagePicker.assetId 是 MediaStore 的数字 ID；legacy 接口以此查原片 EXIF。
        location = (await LegacyMediaLibrary.getAssetInfoAsync(assetId))?.location;
      }
      if (!location) return null;
      return readExifGps({
        GPSLatitude: location.latitude,
        GPSLongitude: location.longitude,
      });
    } catch (error) {
      // 共享图库、Android 文件选择器或受限权限均可能让资产无法再次访问；继续出片。
      console.warn('[retro-film-cam] 未能读取所选照片资产的位置：', error);
      return null;
    }
  };
}
