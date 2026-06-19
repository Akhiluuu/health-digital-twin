import { initializeApp } from "firebase/app";
// @ts-ignore — getReactNativePersistence is available at runtime in Firebase 12
// but TypeScript types may not expose it depending on the module resolution
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const firebaseConfig = Constants.expoConfig?.extra?.firebaseConfig || {
  apiKey: "AIzaSyBO9o2UiP6WH0NCHX15WvwYR8FP4--l9jI",
  authDomain: "vital-health-2026-1e1ee.firebaseapp.com",
  projectId: "vital-health-2026-1e1ee",
  storageBucket: "vital-health-2026-1e1ee.firebasestorage.app",
  messagingSenderId: "531709406873",
  appId: "1:531709406873:web:81199b6c6fb8c0cefa9208",
  measurementId: "G-E5HQKHME00"
};

const app = initializeApp(firebaseConfig);

// ✅ Auth with AsyncStorage persistence — login session survives app restarts
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// ✅ Firestore
export const db = getFirestore(app);

// ✅ Functions
export const functions = getFunctions(app);

export default app;