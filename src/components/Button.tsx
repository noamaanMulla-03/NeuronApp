import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ActivityIndicator,
    ViewStyle,
    TextStyle,
} from 'react-native';
import { theme } from '../theme';

interface ButtonProps {
    title: string;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
    variant?: 'primary' | 'secondary' | 'outline' | 'google';
    style?: ViewStyle;
    textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
    title,
    onPress,
    loading = false,
    disabled = false,
    variant = 'primary',
    style,
    textStyle,
}) => {
    const getButtonStyle = () => {
        switch (variant) {
            case 'secondary':
                return styles.secondaryButton;
            case 'outline':
                return styles.outlineButton;
            case 'google':
                return styles.googleButton;
            default:
                return styles.primaryButton;
        }
    };

    const getTextStyle = () => {
        switch (variant) {
            case 'outline':
                return styles.outlineText;
            case 'google':
                return styles.googleText;
            case 'secondary':
                return styles.secondaryText;
            default:
                return styles.primaryText;
        }
    };

    return (
        <TouchableOpacity
            style={[
                styles.button,
                getButtonStyle(),
                (disabled || loading) && styles.disabled,
                style,
            ]}
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.7}
        >
            {loading ? (
                <ActivityIndicator
                    color={variant === 'outline' || variant === 'google' ? theme.colors.primary : theme.colors.onPrimary}
                    size="small"
                />
            ) : (
                <Text style={[getTextStyle(), textStyle]}>{title}</Text>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: theme.roundness.lg,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52,
    },
    primaryButton: {
        backgroundColor: theme.colors.primary,
        // No border for primary
    },
    secondaryButton: {
        backgroundColor: theme.colors.surfaceContainerHigh,
    },
    outlineButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
    },
    googleButton: {
        backgroundColor: theme.colors.surfaceContainerLowest,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
    },
    disabled: {
        opacity: 0.6,
    },
    primaryText: {
        color: theme.colors.onPrimary,
        fontSize: 15,
        fontWeight: '700',
        fontFamily: theme.typography.fonts.body,
    },
    secondaryText: {
        color: theme.colors.primary,
        fontSize: 15,
        fontWeight: '700',
        fontFamily: theme.typography.fonts.body,
    },
    outlineText: {
        color: theme.colors.onSurfaceVariant,
        fontSize: 15,
        fontWeight: '600',
        fontFamily: theme.typography.fonts.body,
    },
    googleText: {
        color: theme.colors.onSurface,
        fontSize: 15,
        fontWeight: '600',
        fontFamily: theme.typography.fonts.body,
    },
});
