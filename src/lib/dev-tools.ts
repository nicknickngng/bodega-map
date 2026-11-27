/**
 * Developer tools (e.g. location spoofing) are on in development (Expo Go via
 * a dev server, development builds) and in builds or updates made with
 * EXPO_PUBLIC_DEV_TOOLS=1 (the EAS `development` and `preview` environments).
 * They're never on in TestFlight / production, which don't set it.
 */
export const DEV_TOOLS_ENABLED: boolean =
  __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === '1';
