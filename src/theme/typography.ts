import { Platform } from 'react-native';

export const typography = {
    fonts: {
        // Manrope (Headlines) - Fallback to system bold sans-serif
        headline: Platform.select({
            ios: 'System',
            android: 'sans-serif-medium',
        }),
        // Inter (Body) - Fallback to system regular sans-serif
        body: Platform.select({
            ios: 'System',
            android: 'sans-serif',
        }),
    },
    styles: {
        displayLG: {
            fontSize: 56, // 3.5rem -> px approx
            fontWeight: '800' as const,
            letterSpacing: -1.12, // -2%
            lineHeight: 64,
        },
        headlineMD: {
            fontSize: 28, // 1.75rem
            fontWeight: '700' as const,
            letterSpacing: -0.56, // -2%
            lineHeight: 36,
        },
        titleMD: {
            fontSize: 18, // 1.125rem
            fontWeight: '500' as const,
            lineHeight: 24,
        },
        bodyLG: {
            fontSize: 16, // 1rem
            fontWeight: '400' as const,
            lineHeight: 24,
        },
        labelMD: {
            fontSize: 12, // 0.75rem
            fontWeight: '700' as const,
            textTransform: 'uppercase' as const,
            letterSpacing: 0.5,
        },
    },
};
