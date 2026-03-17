import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import * as Keychain from 'react-native-keychain';

const rnBiometrics = new ReactNativeBiometrics();
const BIOMETRIC_KEY = 'biometric_enabled';

export const isBiometricAvailable = async (): Promise<boolean> => {
  const { available, biometryType } = await rnBiometrics.isSensorAvailable();
  return available && biometryType !== undefined;
};

export const getBiometricType = async (): Promise<string> => {
  const { biometryType } = await rnBiometrics.isSensorAvailable();
  if (biometryType === BiometryTypes.FaceID) return 'Face ID';
  if (biometryType === BiometryTypes.TouchID) return 'Touch ID';
  if (biometryType === BiometryTypes.Biometrics) return 'Biometrics';
  return 'Biometric';
};

export const enableBiometric = async (): Promise<boolean> => {
  const available = await isBiometricAvailable();
  if (!available) return false;

  const { success } = await rnBiometrics.simplePrompt({
    promptMessage: 'Authenticate to enable biometric login',
    cancelButtonText: 'Use password',
  });

  if (success) {
    await Keychain.setGenericPassword(BIOMETRIC_KEY, 'true', {
      service: BIOMETRIC_KEY,
    });
    return true;
  }
  return false;
};

export const disableBiometric = async (): Promise<void> => {
  await Keychain.resetGenericPassword({ service: BIOMETRIC_KEY });
};

export const isBiometricEnabled = async (): Promise<boolean> => {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: BIOMETRIC_KEY,
    });
    return credentials && credentials.password === 'true';
  } catch {
    return false;
  }
};

export const authenticateWithBiometric = async (): Promise<boolean> => {
  const available = await isBiometricAvailable();
  if (!available) return false;

  const { success } = await rnBiometrics.simplePrompt({
    promptMessage: 'Authenticate to sign in',
    cancelButtonText: 'Use password',
  });

  return success;
};
