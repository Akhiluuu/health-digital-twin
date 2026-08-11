import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useTheme } from "./ThemeContext";
import { colors } from "../theme/colors";

const { width } = Dimensions.get("window");

export type AlertType = "success" | "warning" | "error" | "info";

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

export interface AlertOptions {
  title: string;
  message?: string;
  type?: AlertType;
  buttons?: AlertButton[];
}

export interface ToastOptions {
  message: string;
  type?: AlertType;
  duration?: number;
  icon?: string;
}

interface ThemeAlertContextType {
  showAlert: (options: AlertOptions) => void;
  showToast: (options: ToastOptions | string) => void;
  hideAlert: () => void;
  hideToast: () => void;
}

const ThemeAlertContext = createContext<ThemeAlertContextType | undefined>(undefined);

export const ThemeAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  const c = colors[theme];
  const isDark = theme === "dark";

  // Alert State
  const [alertConfig, setAlertConfig] = useState<AlertOptions | null>(null);
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Toast State
  const [toastConfig, setToastConfig] = useState<ToastOptions | null>(null);
  const toastYAnim = useRef(new Animated.Value(-100)).current;
  const toastOpacityAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Show Alert Handler ──
  const showAlert = useCallback((options: AlertOptions) => {
    // Trigger Haptic
    if (options.type === "error" || options.type === "warning") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setAlertConfig(options);
    scaleAnim.setValue(0.85);
    opacityAnim.setValue(0);

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, opacityAnim]);

  // ── Hide Alert Handler ──
  const hideAlert = useCallback(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setAlertConfig(null);
    });
  }, [scaleAnim, opacityAnim]);

  // ── Show Toast Handler ──
  const showToast = useCallback((options: ToastOptions | string) => {
    const config: ToastOptions = typeof options === "string" ? { message: options, type: "success" } : options;
    
    if (toastTimer.current) clearTimeout(toastTimer.current);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setToastConfig(config);
    toastYAnim.setValue(-100);
    toastOpacityAnim.setValue(0);

    Animated.parallel([
      Animated.spring(toastYAnim, {
        toValue: Platform.OS === "ios" ? 54 : 40,
        friction: 8,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.timing(toastOpacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    const duration = config.duration ?? 2500;
    toastTimer.current = setTimeout(() => {
      hideToast();
    }, duration);
  }, [toastYAnim, toastOpacityAnim]);

  // ── Hide Toast Handler ──
  const hideToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(toastYAnim, {
        toValue: -100,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(toastOpacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToastConfig(null);
    });
  }, [toastYAnim, toastOpacityAnim]);

  // Helper for alert colors & icons
  const getTypeMeta = (type?: AlertType) => {
    switch (type) {
      case "success":
        return { color: "#10b981", icon: "checkmark-circle", bg: "#10b98118" };
      case "warning":
        return { color: "#f59e0b", icon: "warning", bg: "#f59e0b18" };
      case "error":
        return { color: "#ef4444", icon: "close-circle", bg: "#ef444418" };
      case "info":
      default:
        return { color: c.accent, icon: "information-circle", bg: c.accent + "18" };
    }
  };

  const alertMeta = alertConfig ? getTypeMeta(alertConfig.type) : null;
  const toastMeta = toastConfig ? getTypeMeta(toastConfig.type) : null;

  return (
    <ThemeAlertContext.Provider value={{ showAlert, showToast, hideAlert, hideToast }}>
      {children}

      {/* ── FLOATING TOP TOAST BANNER ── */}
      {toastConfig && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toastContainer,
            {
              transform: [{ translateY: toastYAnim }],
              opacity: toastOpacityAnim,
            },
          ]}
        >
          <LinearGradient
            colors={
              isDark
                ? ["rgba(17, 29, 58, 0.96)", "rgba(11, 19, 41, 0.98)"]
                : ["rgba(255, 255, 255, 0.98)", "rgba(241, 245, 249, 0.98)"]
            }
            style={[
              styles.toastCapsule,
              {
                borderColor: toastMeta?.color + "50",
                shadowColor: toastMeta?.color,
              },
            ]}
          >
            <View style={[styles.toastIconBox, { backgroundColor: toastMeta?.bg }]}>
              <Ionicons
                name={(toastConfig.icon as any) || (toastMeta?.icon as any)}
                size={18}
                color={toastMeta?.color}
              />
            </View>
            <Text style={[styles.toastText, { color: c.text }]}>{toastConfig.message}</Text>
          </LinearGradient>
        </Animated.View>
      )}

      {/* ── THEME-AWARE DIALOG POPUP MODAL ── */}
      {alertConfig && (
        <Modal transparent visible animationType="none" onRequestClose={hideAlert}>
          <View style={styles.modalOverlay}>
            <Animated.View
              style={[
                styles.alertCardContainer,
                {
                  opacity: opacityAnim,
                  transform: [{ scale: scaleAnim }],
                },
              ]}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ["#111d3a", "#0b1329"]
                    : ["#ffffff", "#f8fafc"]
                }
                style={[
                  styles.alertCard,
                  {
                    borderColor: alertMeta?.color + "40",
                    borderWidth: 1.5,
                  },
                ]}
              >
                {/* Status Badge Header Icon */}
                <View style={[styles.alertHeaderIconCircle, { backgroundColor: alertMeta?.bg }]}>
                  <Ionicons name={alertMeta?.icon as any} size={36} color={alertMeta?.color} />
                </View>

                {/* Title & Message */}
                <Text style={[styles.alertTitle, { color: c.text }]}>{alertConfig.title}</Text>
                {alertConfig.message ? (
                  <Text style={[styles.alertMessage, { color: c.sub }]}>{alertConfig.message}</Text>
                ) : null}

                {/* Action Buttons */}
                <View style={styles.buttonRow}>
                  {alertConfig.buttons && alertConfig.buttons.length > 0 ? (
                    alertConfig.buttons.map((btn, index) => {
                      const isDestructive = btn.style === "destructive";
                      const isCancel = btn.style === "cancel";
                      const isPrimary = !isCancel;

                      const btnBg = isDestructive
                        ? "#ef4444"
                        : isPrimary
                        ? c.accent
                        : isDark
                        ? "#1e293b"
                        : "#f1f5f9";

                      const btnTxtColor = isDestructive || isPrimary ? "#ffffff" : c.text;

                      return (
                        <TouchableOpacity
                          key={index}
                          activeOpacity={0.8}
                          style={[
                            styles.actionButton,
                            {
                              backgroundColor: btnBg,
                              borderWidth: isCancel ? 1 : 0,
                              borderColor: c.border,
                              flex: alertConfig.buttons!.length > 1 ? 1 : undefined,
                              minWidth: alertConfig.buttons!.length === 1 ? 140 : undefined,
                            },
                          ]}
                          onPress={() => {
                            hideAlert();
                            if (btn.onPress) btn.onPress();
                          }}
                        >
                          <Text style={[styles.actionButtonText, { color: btnTxtColor }]}>
                            {btn.text}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={[styles.actionButton, { backgroundColor: c.accent, minWidth: 140 }]}
                      onPress={hideAlert}
                    >
                      <Text style={[styles.actionButtonText, { color: "#ffffff" }]}>OK</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </LinearGradient>
            </Animated.View>
          </View>
        </Modal>
      )}
    </ThemeAlertContext.Provider>
  );
};

export const useThemeAlert = (): ThemeAlertContextType => {
  const ctx = useContext(ThemeAlertContext);
  if (!ctx) {
    throw new Error("useThemeAlert must be used within a ThemeAlertProvider");
  }
  return ctx;
};

const styles = StyleSheet.create({
  toastContainer: {
    position: "absolute",
    top: 0,
    left: 20,
    right: 20,
    zIndex: 99999,
    alignItems: "center",
  },
  toastCapsule: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    maxWidth: width - 40,
    gap: 10,
  },
  toastIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  toastText: {
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  alertCardContainer: {
    width: "100%",
    maxWidth: 380,
  },
  alertCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  alertHeaderIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  alertMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    justifyContent: "center",
    marginTop: 4,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
});

