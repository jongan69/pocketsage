import * as Font from 'expo-font';

/**
 * App font families. The .ttf assets ship as placeholders in development
 * (and get real binaries before release); `loadAppFonts` falls back to
 * system fonts when the binaries are unusable, so the app always renders.
 */
export const FONT_FAMILIES = {
  regular: 'Inter',
  bold: 'Inter-Bold',
  mono: 'JetBrainsMono',
} as const;

let customFontsLoaded = false;

export function areCustomFontsLoaded(): boolean {
  return customFontsLoaded;
}

export async function loadAppFonts(): Promise<void> {
  try {
    await Font.loadAsync({
      [FONT_FAMILIES.regular]: require('@/assets/fonts/Inter-Regular.ttf'),
      [FONT_FAMILIES.bold]: require('@/assets/fonts/Inter-Bold.ttf'),
      [FONT_FAMILIES.mono]: require('@/assets/fonts/JetBrainsMono-Regular.ttf'),
    });
    customFontsLoaded = true;
  } catch (error) {
    // Placeholder (0-byte) font binaries fail to load — use system fonts.
    console.warn('[fonts] Custom fonts unavailable, falling back to system fonts', error);
    customFontsLoaded = false;
  }
}
