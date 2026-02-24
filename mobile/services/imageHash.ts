import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

export const computeImageHash = async (uri: string): Promise<string> => {
  try {
    const info = await FileSystem.getInfoAsync(uri, { md5: true });
    if (info.exists && info.md5) {
      return info.md5;
    }

    const size = info.exists ? info.size : 0;
    const modified = info.exists && 'modificationTime' in info ? info.modificationTime ?? '' : '';
    const fingerprint = `${uri}|${size}|${modified}`;
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, fingerprint);
  } catch {
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, uri);
  }
};
