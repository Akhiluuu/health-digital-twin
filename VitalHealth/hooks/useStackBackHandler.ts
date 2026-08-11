// hooks/useStackBackHandler.ts
//
// Standardizes Android hardware back button and swipe-back gesture handling
// for Stack screens. Must be used INSIDE a screen component — it attaches
// a BackHandler listener only when the screen is focused (useFocusEffect),
// so it won't interfere with other screens in the stack.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { BackHandler } from "react-native";

/**
 * @param customBackHandler  Optional. Return `true` if you handled an internal
 *                           state change (e.g. close a sub-panel). Return
 *                           `false` / `undefined` to fall through to the
 *                           standard `router.back()` stack pop.
 */
export function useStackBackHandler(customBackHandler?: () => boolean | void) {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // 1. Give the screen a chance to handle internal state first
        if (customBackHandler) {
          const handled = customBackHandler();
          if (handled === true) return true;
        }

        // 2. Pop the stack the standard way
        if (router.canGoBack()) {
          router.back();
          return true;
        }

        // 3. Nothing to pop — fall back to the Journey tab root
        router.replace("/(tabs)");
        return true;
      };

      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [customBackHandler, router])
  );
}
