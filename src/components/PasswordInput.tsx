import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { theme } from '../theme';

interface PasswordInputProps extends Omit<TextInputProps, 'secureTextEntry'> {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  showStrengthIndicator?: boolean;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  label,
  error,
  containerStyle,
  showStrengthIndicator = false,
  onFocus,
  onBlur,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };

  const getPasswordStrength = (password: string): number => {
    if (!password) return 0;
    let strength = 0;
    if (password.length >= 6) strength += 1;
    if (password.length >= 8) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    return strength;
  };

  const getStrengthColor = (strength: number): string => {
    if (strength <= 1) return theme.colors.error;
    if (strength <= 2) return '#FF9500';
    if (strength <= 3) return '#34C759';
    return theme.colors.primary;
  };

  const strength = getPasswordStrength(props.value || '');

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[
          styles.inputContainer, 
          isFocused && styles.inputFocused,
          error && styles.inputError
      ]}>
        <TextInput
          style={styles.input}
          secureTextEntry={!showPassword}
          placeholderTextColor={theme.colors.onSurfaceVariant + '80'}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
        <TouchableOpacity
          style={styles.toggleButton}
          onPress={() => setShowPassword(!showPassword)}
        >
          <Text style={styles.toggleText}>
            {showPassword ? 'Hide' : 'Show'}
          </Text>
        </TouchableOpacity>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {showStrengthIndicator && props.value && (
        <View style={styles.strengthContainer}>
          <View style={styles.strengthBar}>
            <View
              style={[
                styles.strengthFill,
                {
                  width: `${(strength / 5) * 100}%`,
                  backgroundColor: getStrengthColor(strength),
                },
              ]}
            />
          </View>
          <Text style={[styles.strengthText, { color: getStrengthColor(strength) }]}>
            {strength <= 1 && 'Weak'}
            {strength > 1 && strength <= 2 && 'Fair'}
            {strength > 2 && strength <= 3 && 'Good'}
            {strength > 3 && 'Strong'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
  },
  label: {
    ...theme.typography.styles.labelMD,
    color: theme.colors.onSurfaceVariant,
    marginBottom: theme.spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.roundness.lg,
  },
  inputFocused: {
    borderColor: theme.colors.primary,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.colors.onSurface,
    fontFamily: theme.typography.fonts.body,
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  toggleText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: theme.typography.fonts.body,
  },
  error: {
    color: theme.colors.error,
    fontSize: 12,
    marginTop: 4,
    fontFamily: theme.typography.fonts.body,
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderRadius: 2,
    marginRight: 8,
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: theme.typography.fonts.body,
  },
});
