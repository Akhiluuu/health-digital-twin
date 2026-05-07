// app/nutrition.tsx
// PROFESSIONAL NUTRITION PAGE — synced via NutritionContext
// UPGRADED: Full CSV-powered food search (456 items) + smart quantity picker
// FIX: KeyboardAvoidingView for custom food modal + fixed search bar layout

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import {
  healthProfiles,
  mealTypes,
  useNutrition,
} from "../context/NutritionContext";
import { useTheme } from "../context/ThemeContext";
import { useBiogearsTwin } from "../context/BiogearsTwinContext";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CsvFoodItem {
  food: string;
  cuisine: string;
  category: string;
  display_amount: string;
  grams_per_display: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  calories: number;
  sugar_g: number;
  sodium_mg: number;
  fiber_g: number;
  notes: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function parseDisplayAmount(display_amount: string): {
  base: number;
  unit: string;
  unitLabel: string;
} {
  const trimmed = display_amount.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)/);
  if (!match) return { base: 1, unit: trimmed, unitLabel: trimmed };
  const base = parseFloat(match[1]);
  const unit = match[2].trim() || "serving";
  const unitLabelMap: Record<string, string> = {
    eggs: "eggs", egg: "eggs", large: "large", piece: "pieces", pieces: "pieces",
    plate: "plates", bowl: "bowls", cup: "cups", glass: "glasses",
    serving: "servings", roll: "rolls", wrap: "wraps", slice: "slices",
    slices: "slices", nests: "nests", skewer: "skewers", bar: "bars",
    packet: "packets", patty: "patties", handful: "handfuls", tbsp: "tbsp",
    tsp: "tsp", g: "g", ml: "ml", can: "cans", bottle: "bottles",
    burger: "burgers", "hot dog": "hot dogs", burrito: "burritos",
    shot: "shots", cookies: "cookies",
  };
  const unitLabel =
    unitLabelMap[unit.toLowerCase()] ??
    unitLabelMap[unit.toLowerCase().replace(/s$/, "")] ??
    unit;
  return { base, unit, unitLabel };
}

function scaleNutrients(food: CsvFoodItem, multiplier: number) {
  return {
    calories: Math.round(food.calories * multiplier),
    protein:  Math.round(food.protein_g * multiplier * 10) / 10,
    carbs:    Math.round(food.carbs_g   * multiplier * 10) / 10,
    fat:      Math.round(food.fat_g     * multiplier * 10) / 10,
    sugar:    Math.round(food.sugar_g   * multiplier * 10) / 10,
    sodium:   Math.round(food.sodium_mg * multiplier),
    fiber:    Math.round(food.fiber_g   * multiplier * 10) / 10,
  };
}

function getCategoryColor(category: string, colors: Record<string, string>): string {
  const map: Record<string, string> = {
    breakfast: colors.warning, snack: colors.orange, meal: colors.accent,
    beverage: colors.purple, fruit: colors.success, protein: colors.danger,
    staple: colors.sub, dairy: "#60a5fa", nut: "#d97706", fat: "#fbbf24",
    legume: "#4ade80", vegetable: "#34d399", sweetener: colors.danger,
    seed: "#a3e635", ingredient: colors.sub, "side dish": colors.success,
    soup: "#38bdf8", salad: "#6ee7b7", dessert: "#f472b6", bakery: colors.warning,
    salads: "#6ee7b7",
  };
  return map[category] ?? colors.sub;
}

function getQuickQuantities(base: number, unit: string): number[] {
  const u = unit.toLowerCase();
  if (["g", "ml"].includes(u)) return [50, 100, 150, 200, 250, 300];
  if (["tbsp"].includes(u))     return [1, 2, 3, 4];
  if (["tsp"].includes(u))      return [1, 2, 3, 4];
  if (base === 1)  return [1, 2, 3, 4, 5, 6];
  if (base === 2)  return [2, 4, 6, 8, 10, 12];
  if (base === 3)  return [3, 6, 9, 12];
  if (base === 4)  return [4, 8, 12, 16];
  if (base === 6)  return [6, 12, 18, 24];
  return [base, base * 2, base * 3, base * 4];
}

// ─── Full CSV Food Database (456 items) ───────────────────────────────────────
export const CSV_FOOD_DB: CsvFoodItem[] = [
  { food:"Omelette", cuisine:"Eggs", category:"breakfast", display_amount:"2 eggs", grams_per_display:120.0, protein_g:14.0, carbs_g:2.0, fat_g:15.0, calories:190.0, sugar_g:0.36, sodium_mg:0, fiber_g:0.16, notes:"Plain omelette." },
  { food:"Egg Bhurji", cuisine:"Indian", category:"breakfast", display_amount:"1 serving", grams_per_display:150.0, protein_g:14.0, carbs_g:6.0, fat_g:16.0, calories:220.0, sugar_g:1.08, sodium_mg:0, fiber_g:0.48, notes:"Indian spiced scrambled eggs." },
  { food:"Poha", cuisine:"Marathi", category:"breakfast", display_amount:"1 plate", grams_per_display:200.0, protein_g:6.0, carbs_g:44.0, fat_g:12.0, calories:300.0, sugar_g:7.92, sodium_mg:0, fiber_g:3.52, notes:"Flattened rice with vegetables." },
  { food:"Sabudana Khichdi", cuisine:"Marathi", category:"breakfast", display_amount:"1 plate", grams_per_display:200.0, protein_g:5.0, carbs_g:50.0, fat_g:16.0, calories:380.0, sugar_g:9.0, sodium_mg:0, fiber_g:4.0, notes:"Sago khichdi." },
  { food:"Adai", cuisine:"South Indian", category:"breakfast", display_amount:"1 piece", grams_per_display:70.0, protein_g:5.0, carbs_g:19.0, fat_g:4.0, calories:132.0, sugar_g:3.42, sodium_mg:0, fiber_g:1.52, notes:"Mixed lentil crepe." },
  { food:"Appam", cuisine:"South Indian", category:"breakfast", display_amount:"1 piece", grams_per_display:60.0, protein_g:2.1, carbs_g:14.4, fat_g:1.2, calories:78.0, sugar_g:2.59, sodium_mg:0, fiber_g:1.15, notes:"Plain appam." },
  { food:"Appam with Vegetable Stew", cuisine:"South Indian", category:"breakfast", display_amount:"1 serving", grams_per_display:220.0, protein_g:5.0, carbs_g:28.0, fat_g:7.0, calories:195.0, sugar_g:5.04, sodium_mg:0, fiber_g:2.24, notes:"Appam paired with mild vegetable stew." },
  { food:"Dosa", cuisine:"South Indian", category:"breakfast", display_amount:"1 piece", grams_per_display:35.0, protein_g:2.0, carbs_g:12.98, fat_g:1.4, calories:73.0, sugar_g:2.34, sodium_mg:0, fiber_g:1.04, notes:"Plain dosa, generic home-style." },
  { food:"Idiyappam", cuisine:"South Indian", category:"breakfast", display_amount:"2 nests", grams_per_display:100.0, protein_g:3.0, carbs_g:25.0, fat_g:1.0, calories:121.0, sugar_g:4.5, sodium_mg:0, fiber_g:2.0, notes:"String hoppers / rice noodles." },
  { food:"Idli", cuisine:"South Indian", category:"breakfast", display_amount:"1 piece", grams_per_display:39.0, protein_g:1.99, carbs_g:12.01, fat_g:0.2, calories:58.0, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Steamed idli, plain." },
  { food:"Masala Dosa", cuisine:"South Indian", category:"breakfast", display_amount:"1 piece", grams_per_display:180.0, protein_g:8.64, carbs_g:52.2, fat_g:15.84, calories:432.0, sugar_g:9.4, sodium_mg:0, fiber_g:4.18, notes:"Includes potato filling and moderate oil." },
  { food:"Neer Dosa", cuisine:"South Indian", category:"breakfast", display_amount:"1 piece", grams_per_display:25.0, protein_g:0.75, carbs_g:5.25, fat_g:0.5, calories:27.5, sugar_g:0.94, sodium_mg:0, fiber_g:0.42, notes:"Thin rice crepe." },
  { food:"Pongal", cuisine:"South Indian", category:"breakfast", display_amount:"1 plate", grams_per_display:200.0, protein_g:8.6, carbs_g:36.0, fat_g:12.0, calories:300.0, sugar_g:6.48, sodium_mg:0, fiber_g:2.88, notes:"Ven pongal style." },
  { food:"Puttu", cuisine:"South Indian", category:"breakfast", display_amount:"1 serving", grams_per_display:100.0, protein_g:4.0, carbs_g:30.0, fat_g:4.0, calories:170.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Rice flour puttu." },
  { food:"Rava Dosa", cuisine:"South Indian", category:"breakfast", display_amount:"1 piece", grams_per_display:70.0, protein_g:4.0, carbs_g:22.0, fat_g:6.0, calories:158.0, sugar_g:3.96, sodium_mg:0, fiber_g:1.76, notes:"Thin semolina dosa with oil." },
  { food:"Upma", cuisine:"South Indian", category:"breakfast", display_amount:"1 plate", grams_per_display:200.0, protein_g:7.0, carbs_g:40.0, fat_g:16.0, calories:320.0, sugar_g:7.2, sodium_mg:0, fiber_g:3.2, notes:"Semolina upma with vegetables." },
  { food:"Uttapam", cuisine:"South Indian", category:"breakfast", display_amount:"1 piece", grams_per_display:120.0, protein_g:5.4, carbs_g:38.4, fat_g:7.2, calories:246.0, sugar_g:6.91, sodium_mg:0, fiber_g:3.07, notes:"Plain vegetable uttapam." },
  { food:"Ven Pongal", cuisine:"South Indian", category:"breakfast", display_amount:"1 plate", grams_per_display:250.0, protein_g:7.0, carbs_g:35.0, fat_g:11.0, calories:267.0, sugar_g:6.3, sodium_mg:0, fiber_g:2.8, notes:"Rice and moong dal pongal with ghee." },
  { food:"Oatmeal", cuisine:"Western", category:"breakfast", display_amount:"1 bowl", grams_per_display:40.0, protein_g:6.76, carbs_g:26.52, fat_g:2.76, calories:155.6, sugar_g:4.77, sodium_mg:0, fiber_g:2.12, notes:"Dry rolled oats basis." },
  { food:"Porridge", cuisine:"Western", category:"breakfast", display_amount:"1 bowl", grams_per_display:200.0, protein_g:5.0, carbs_g:24.0, fat_g:5.0, calories:144.0, sugar_g:4.32, sodium_mg:0, fiber_g:1.92, notes:"Cooked oat porridge." },
  { food:"Falafel", cuisine:"Arabian", category:"snack", display_amount:"1 piece", grams_per_display:30.0, protein_g:2.5, carbs_g:5.0, fat_g:2.5, calories:60.0, sugar_g:0.9, sodium_mg:0, fiber_g:0.4, notes:"Single falafel ball." },
  { food:"Chicken Dumplings", cuisine:"Chinese", category:"snack", display_amount:"4 pieces", grams_per_display:120.0, protein_g:10.0, carbs_g:18.0, fat_g:5.0, calories:160.0, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Steamed chicken dumplings." },
  { food:"Spring Roll", cuisine:"Chinese", category:"snack", display_amount:"1 piece", grams_per_display:80.0, protein_g:3.0, carbs_g:10.0, fat_g:6.0, calories:110.0, sugar_g:1.8, sodium_mg:0, fiber_g:0.8, notes:"Deep-fried spring roll." },
  { food:"Veg Dumplings", cuisine:"Chinese", category:"snack", display_amount:"4 pieces", grams_per_display:120.0, protein_g:6.0, carbs_g:20.0, fat_g:4.0, calories:150.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Steamed vegetable dumplings." },
  { food:"Chocolate Bar", cuisine:"Dessert", category:"snack", display_amount:"1 bar", grams_per_display:50.0, protein_g:3.9, carbs_g:29.5, fat_g:15.0, calories:273.0, sugar_g:5.31, sodium_mg:0, fiber_g:2.36, notes:"Milk chocolate bar." },
  { food:"Cookies", cuisine:"Dessert", category:"snack", display_amount:"2 cookies", grams_per_display:30.0, protein_g:1.8, carbs_g:21.0, fat_g:6.0, calories:144.0, sugar_g:3.78, sodium_mg:0, fiber_g:1.68, notes:"Generic sweet cookies." },
  { food:"Chicken Burger (Cheese)", cuisine:"Fast Food", category:"snack", display_amount:"1 piece", grams_per_display:250.0, protein_g:50.0, carbs_g:85.0, fat_g:42.5, calories:1050.0, sugar_g:15.3, sodium_mg:0, fiber_g:6.8, notes:"Chicken cheeseburger, average." },
  { food:"Chicken Nuggets", cuisine:"Fast Food", category:"snack", display_amount:"6 pieces", grams_per_display:100.0, protein_g:14.0, carbs_g:15.0, fat_g:18.0, calories:275.0, sugar_g:2.7, sodium_mg:0, fiber_g:1.2, notes:"Breaded nuggets." },
  { food:"French Fries", cuisine:"Fast Food", category:"snack", display_amount:"1 serving", grams_per_display:150.0, protein_g:5.1, carbs_g:61.5, fat_g:22.5, calories:468.0, sugar_g:11.07, sodium_mg:0, fiber_g:4.92, notes:"Deep-fried fries." },
  { food:"Potato Chips", cuisine:"Fast Food", category:"snack", display_amount:"1 packet", grams_per_display:30.0, protein_g:2.1, carbs_g:15.9, fat_g:10.5, calories:160.8, sugar_g:2.86, sodium_mg:0, fiber_g:1.27, notes:"Plain salted chips." },
  { food:"Veg Burger (Cheese)", cuisine:"Fast Food", category:"snack", display_amount:"1 piece", grams_per_display:220.0, protein_g:26.4, carbs_g:70.4, fat_g:30.8, calories:704.0, sugar_g:12.67, sodium_mg:0, fiber_g:5.63, notes:"Vegetable cheeseburger, average." },
  { food:"Bhajiya", cuisine:"Gujarati", category:"snack", display_amount:"1 bowl", grams_per_display:120.0, protein_g:5.0, carbs_g:22.0, fat_g:12.0, calories:220.0, sugar_g:3.96, sodium_mg:0, fiber_g:1.76, notes:"Gram flour vegetable fritters." },
  { food:"Dabeli", cuisine:"Gujarati", category:"snack", display_amount:"1 piece", grams_per_display:180.0, protein_g:6.0, carbs_g:35.0, fat_g:12.0, calories:272.0, sugar_g:6.3, sodium_mg:0, fiber_g:2.8, notes:"Spiced potato bun snack." },
  { food:"Dhokla", cuisine:"Gujarati", category:"snack", display_amount:"1 piece", grams_per_display:35.0, protein_g:2.1, carbs_g:9.45, fat_g:1.75, calories:59.5, sugar_g:1.7, sodium_mg:0, fiber_g:0.76, notes:"Steamed khaman/dhokla style." },
  { food:"Dhokla Sandwich", cuisine:"Gujarati", category:"snack", display_amount:"2 pieces", grams_per_display:70.0, protein_g:5.0, carbs_g:16.0, fat_g:2.0, calories:102.0, sugar_g:2.88, sodium_mg:0, fiber_g:1.28, notes:"Dhokla layered with chutney and filling." },
  { food:"Fafda", cuisine:"Gujarati", category:"snack", display_amount:"1 serving", grams_per_display:50.0, protein_g:3.5, carbs_g:15.0, fat_g:9.0, calories:150.0, sugar_g:2.7, sodium_mg:0, fiber_g:1.2, notes:"Fried gram flour snack." },
  { food:"Khaman", cuisine:"Gujarati", category:"snack", display_amount:"1 piece", grams_per_display:40.0, protein_g:3.0, carbs_g:10.0, fat_g:1.0, calories:61.0, sugar_g:1.8, sodium_mg:0, fiber_g:0.8, notes:"Steamed gram-flour snack." },
  { food:"Khandvi", cuisine:"Gujarati", category:"snack", display_amount:"1 serving", grams_per_display:100.0, protein_g:5.0, carbs_g:15.0, fat_g:6.0, calories:140.0, sugar_g:2.7, sodium_mg:0, fiber_g:1.2, notes:"Besan rolls with coconut." },
  { food:"Khichu", cuisine:"Gujarati", category:"snack", display_amount:"1 bowl", grams_per_display:100.0, protein_g:2.5, carbs_g:18.0, fat_g:1.0, calories:90.0, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Steamed rice-flour snack." },
  { food:"Patra", cuisine:"Gujarati", category:"snack", display_amount:"1 roll", grams_per_display:50.0, protein_g:2.0, carbs_g:12.0, fat_g:3.0, calories:83.0, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Arbi leaves rolled snack." },
  { food:"Aloo Bhujia", cuisine:"Indian", category:"snack", display_amount:"1 bowl", grams_per_display:30.0, protein_g:2.0, carbs_g:18.0, fat_g:10.0, calories:170.0, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Potato sev snack." },
  { food:"Bhujia", cuisine:"Indian", category:"snack", display_amount:"1 handful", grams_per_display:30.0, protein_g:2.4, carbs_g:16.5, fat_g:9.0, calories:153.0, sugar_g:2.97, sodium_mg:0, fiber_g:1.32, notes:"Generic sev/bhujia-style fried snack." },
  { food:"Chivda", cuisine:"Indian", category:"snack", display_amount:"1 cup", grams_per_display:30.0, protein_g:1.2, carbs_g:16.5, fat_g:5.4, calories:102.0, sugar_g:2.97, sodium_mg:0, fiber_g:1.32, notes:"Mixed flattened rice snack, average." },
  { food:"Corn Chaat", cuisine:"Indian", category:"snack", display_amount:"1 bowl", grams_per_display:150.0, protein_g:4.0, carbs_g:30.0, fat_g:4.0, calories:170.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Boiled corn with spices and lemon." },
  { food:"Egg Roll (Street)", cuisine:"Indian", category:"snack", display_amount:"1 roll", grams_per_display:150.0, protein_g:21.0, carbs_g:42.0, fat_g:21.0, calories:480.0, sugar_g:7.56, sodium_mg:0, fiber_g:3.36, notes:"Street-style egg roll." },
  { food:"Mixture", cuisine:"Indian", category:"snack", display_amount:"1 bowl", grams_per_display:35.0, protein_g:4.0, carbs_g:20.0, fat_g:11.0, calories:190.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Mixed savory snack mix." },
  { food:"Sev", cuisine:"Indian", category:"snack", display_amount:"1 bowl", grams_per_display:30.0, protein_g:3.0, carbs_g:17.0, fat_g:9.0, calories:160.0, sugar_g:3.06, sodium_mg:0, fiber_g:1.36, notes:"Gram flour sev." },
  { food:"Gobi Manchurian", cuisine:"Indo-Chinese", category:"snack", display_amount:"1 plate", grams_per_display:200.0, protein_g:5.0, carbs_g:24.0, fat_g:14.0, calories:220.0, sugar_g:4.32, sodium_mg:0, fiber_g:1.92, notes:"Fried cauliflower in sauce." },
  { food:"Manchurian Dry", cuisine:"Indo-Chinese", category:"snack", display_amount:"1 plate", grams_per_display:200.0, protein_g:7.0, carbs_g:20.0, fat_g:12.0, calories:200.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Dry vegetable/chicken manchurian." },
  { food:"Bruschetta", cuisine:"Italian", category:"snack", display_amount:"2 pieces", grams_per_display:80.0, protein_g:4.8, carbs_g:16.0, fat_g:8.0, calories:144.0, sugar_g:2.88, sodium_mg:0, fiber_g:1.28, notes:"Tomato bruschetta." },
  { food:"Garlic Bread", cuisine:"Italian", category:"snack", display_amount:"2 slices", grams_per_display:60.0, protein_g:5.4, carbs_g:22.8, fat_g:7.2, calories:192.0, sugar_g:4.1, sodium_mg:0, fiber_g:1.82, notes:"Bread with garlic butter." },
  { food:"Edamame", cuisine:"Japanese", category:"snack", display_amount:"1 cup", grams_per_display:155.0, protein_g:17.0, carbs_g:14.0, fat_g:8.0, calories:190.0, sugar_g:2.52, sodium_mg:0, fiber_g:1.12, notes:"Steamed soybeans." },
  { food:"Onigiri", cuisine:"Japanese", category:"snack", display_amount:"1 piece", grams_per_display:120.0, protein_g:4.0, carbs_g:32.0, fat_g:1.0, calories:150.0, sugar_g:5.76, sodium_mg:0, fiber_g:2.56, notes:"Rice ball." },
  { food:"Sushi Piece (Average)", cuisine:"Japanese", category:"snack", display_amount:"1 piece", grams_per_display:30.0, protein_g:1.6, carbs_g:5.0, fat_g:0.8, calories:35.0, sugar_g:0.9, sodium_mg:0, fiber_g:0.4, notes:"Average sushi piece." },
  { food:"Tempura", cuisine:"Japanese", category:"snack", display_amount:"1 serving", grams_per_display:150.0, protein_g:6.0, carbs_g:16.0, fat_g:12.0, calories:200.0, sugar_g:2.88, sodium_mg:0, fiber_g:1.28, notes:"Mixed tempura." },
  { food:"Tteokbokki", cuisine:"Korean", category:"snack", display_amount:"1 bowl", grams_per_display:250.0, protein_g:4.0, carbs_g:50.0, fat_g:5.0, calories:280.0, sugar_g:9.0, sodium_mg:0, fiber_g:4.0, notes:"Rice cake in spicy sauce." },
  { food:"Bhakarwadi", cuisine:"Maharashtrian", category:"snack", display_amount:"2 pieces", grams_per_display:40.0, protein_g:2.8, carbs_g:19.2, fat_g:6.0, calories:120.0, sugar_g:3.46, sodium_mg:0, fiber_g:1.54, notes:"Spiced rolled snack, average." },
  { food:"Kothimbir Vadi", cuisine:"Marathi", category:"snack", display_amount:"2 pieces", grams_per_display:80.0, protein_g:4.0, carbs_g:14.0, fat_g:6.0, calories:126.0, sugar_g:2.52, sodium_mg:0, fiber_g:1.12, notes:"Coriander gram-flour snack." },
  { food:"Vada Pav", cuisine:"Marathi", category:"snack", display_amount:"1 piece", grams_per_display:150.0, protein_g:8.25, carbs_g:42.0, fat_g:21.0, calories:390.0, sugar_g:7.56, sodium_mg:0, fiber_g:3.36, notes:"Potato fritter in pav." },
  { food:"Shawarma (Chicken)", cuisine:"Middle Eastern", category:"snack", display_amount:"1 roll", grams_per_display:250.0, protein_g:40.0, carbs_g:112.5, fat_g:50.0, calories:1075.0, sugar_g:20.25, sodium_mg:0, fiber_g:9.0, notes:"Chicken shawarma wrap, average street-style." },
  { food:"Shawarma (Paneer)", cuisine:"Middle Eastern", category:"snack", display_amount:"1 roll", grams_per_display:250.0, protein_g:35.0, carbs_g:105.0, fat_g:55.0, calories:1075.0, sugar_g:18.9, sodium_mg:0, fiber_g:8.4, notes:"Paneer shawarma wrap, average." },
  { food:"Shawarma (Veg)", cuisine:"Middle Eastern", category:"snack", display_amount:"1 roll", grams_per_display:250.0, protein_g:22.5, carbs_g:120.0, fat_g:45.0, calories:900.0, sugar_g:21.6, sodium_mg:0, fiber_g:9.6, notes:"Vegetable shawarma wrap, average." },
  { food:"Chicken Momos", cuisine:"North Eastern", category:"snack", display_amount:"4 pieces", grams_per_display:140.0, protein_g:9.8, carbs_g:39.2, fat_g:9.8, calories:266.0, sugar_g:7.06, sodium_mg:0, fiber_g:3.14, notes:"Steamed chicken dumplings." },
  { food:"Chicken Momos (6 pcs)", cuisine:"North Eastern", category:"snack", display_amount:"6 pieces", grams_per_display:180.0, protein_g:16.0, carbs_g:28.0, fat_g:7.0, calories:239.0, sugar_g:5.04, sodium_mg:0, fiber_g:2.24, notes:"Steamed chicken dumplings." },
  { food:"Momos (Chicken, Fried)", cuisine:"North Eastern", category:"snack", display_amount:"4 pieces", grams_per_display:110.0, protein_g:11.0, carbs_g:28.6, fat_g:9.9, calories:253.0, sugar_g:5.15, sodium_mg:0, fiber_g:2.29, notes:"Fried chicken momos." },
  { food:"Momos (Chicken, Steamed)", cuisine:"North Eastern", category:"snack", display_amount:"4 pieces", grams_per_display:100.0, protein_g:9.0, carbs_g:24.0, fat_g:4.0, calories:170.0, sugar_g:4.32, sodium_mg:0, fiber_g:1.92, notes:"Steamed chicken momos." },
  { food:"Momos (Chicken, Tandoori)", cuisine:"North Eastern", category:"snack", display_amount:"4 pieces", grams_per_display:110.0, protein_g:11.0, carbs_g:27.5, fat_g:7.7, calories:231.0, sugar_g:4.95, sodium_mg:0, fiber_g:2.2, notes:"Tandoori chicken momos." },
  { food:"Momos (Paneer, Fried)", cuisine:"North Eastern", category:"snack", display_amount:"4 pieces", grams_per_display:110.0, protein_g:8.8, carbs_g:30.8, fat_g:11.0, calories:264.0, sugar_g:5.54, sodium_mg:0, fiber_g:2.46, notes:"Fried paneer momos." },
  { food:"Momos (Paneer, Steamed)", cuisine:"North Eastern", category:"snack", display_amount:"4 pieces", grams_per_display:100.0, protein_g:8.0, carbs_g:25.0, fat_g:5.0, calories:180.0, sugar_g:4.5, sodium_mg:0, fiber_g:2.0, notes:"Steamed paneer momos." },
  { food:"Momos (Paneer, Tandoori)", cuisine:"North Eastern", category:"snack", display_amount:"4 pieces", grams_per_display:110.0, protein_g:9.9, carbs_g:28.6, fat_g:8.8, calories:242.0, sugar_g:5.15, sodium_mg:0, fiber_g:2.29, notes:"Tandoori paneer momos." },
  { food:"Momos (Veg, Fried)", cuisine:"North Eastern", category:"snack", display_amount:"4 pieces", grams_per_display:110.0, protein_g:6.6, carbs_g:33.0, fat_g:8.8, calories:231.0, sugar_g:5.94, sodium_mg:0, fiber_g:2.64, notes:"Fried vegetable momos." },
  { food:"Momos (Veg, Steamed)", cuisine:"North Eastern", category:"snack", display_amount:"4 pieces", grams_per_display:100.0, protein_g:6.0, carbs_g:27.0, fat_g:2.0, calories:150.0, sugar_g:4.86, sodium_mg:0, fiber_g:2.16, notes:"Steamed vegetable momos." },
  { food:"Momos (Veg, Tandoori)", cuisine:"North Eastern", category:"snack", display_amount:"4 pieces", grams_per_display:110.0, protein_g:7.7, carbs_g:30.8, fat_g:5.5, calories:209.0, sugar_g:5.54, sodium_mg:0, fiber_g:2.46, notes:"Tandoori vegetable momos." },
  { food:"Veg Momos", cuisine:"North Eastern", category:"snack", display_amount:"4 pieces", grams_per_display:120.0, protein_g:6.0, carbs_g:33.6, fat_g:6.0, calories:204.0, sugar_g:6.05, sodium_mg:0, fiber_g:2.69, notes:"Steamed vegetable dumplings." },
  { food:"Veg Momos (6 pcs)", cuisine:"North Eastern", category:"snack", display_amount:"6 pieces", grams_per_display:180.0, protein_g:8.0, carbs_g:30.0, fat_g:5.0, calories:197.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Steamed vegetable dumplings." },
  { food:"Aloo Tikki", cuisine:"North Indian", category:"snack", display_amount:"1 piece", grams_per_display:70.0, protein_g:2.8, carbs_g:17.5, fat_g:5.6, calories:126.0, sugar_g:3.15, sodium_mg:0, fiber_g:1.4, notes:"Shallow-fried potato patty." },
  { food:"Chicken Momos Fried", cuisine:"North Indian", category:"snack", display_amount:"6 pieces", grams_per_display:180.0, protein_g:16.0, carbs_g:30.0, fat_g:12.0, calories:290.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Fried chicken momos." },
  { food:"Chicken Momos Steamed", cuisine:"North Indian", category:"snack", display_amount:"6 pieces", grams_per_display:180.0, protein_g:16.0, carbs_g:28.0, fat_g:5.0, calories:210.0, sugar_g:5.04, sodium_mg:0, fiber_g:2.24, notes:"Steamed chicken momos." },
  { food:"Chicken Momos Tandoori", cuisine:"North Indian", category:"snack", display_amount:"6 pieces", grams_per_display:180.0, protein_g:17.0, carbs_g:26.0, fat_g:9.0, calories:250.0, sugar_g:4.68, sodium_mg:0, fiber_g:2.08, notes:"Tandoori chicken momos." },
  { food:"Chicken Tikka", cuisine:"North Indian", category:"snack", display_amount:"100 g", grams_per_display:100.0, protein_g:26.0, carbs_g:4.0, fat_g:8.0, calories:192.0, sugar_g:0.72, sodium_mg:0, fiber_g:0.32, notes:"Roasted marinated chicken pieces." },
  { food:"Kachori", cuisine:"North Indian", category:"snack", display_amount:"1 piece", grams_per_display:80.0, protein_g:4.0, carbs_g:24.0, fat_g:12.8, calories:232.0, sugar_g:4.32, sodium_mg:0, fiber_g:1.92, notes:"Fried stuffed kachori." },
  { food:"Mathri", cuisine:"North Indian", category:"snack", display_amount:"1 piece", grams_per_display:20.0, protein_g:2.0, carbs_g:12.0, fat_g:5.0, calories:90.0, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Savory fried biscuit." },
  { food:"Pakora", cuisine:"North Indian", category:"snack", display_amount:"1 bowl", grams_per_display:120.0, protein_g:5.0, carbs_g:22.0, fat_g:12.0, calories:220.0, sugar_g:3.96, sodium_mg:0, fiber_g:1.76, notes:"Mixed vegetable fritters." },
  { food:"Paneer Momos Fried", cuisine:"North Indian", category:"snack", display_amount:"6 pieces", grams_per_display:180.0, protein_g:14.0, carbs_g:30.0, fat_g:14.0, calories:320.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Fried paneer momos." },
  { food:"Paneer Momos Steamed", cuisine:"North Indian", category:"snack", display_amount:"6 pieces", grams_per_display:180.0, protein_g:14.0, carbs_g:28.0, fat_g:8.0, calories:240.0, sugar_g:5.04, sodium_mg:0, fiber_g:2.24, notes:"Steamed paneer momos." },
  { food:"Paneer Momos Tandoori", cuisine:"North Indian", category:"snack", display_amount:"6 pieces", grams_per_display:180.0, protein_g:15.0, carbs_g:26.0, fat_g:11.0, calories:280.0, sugar_g:4.68, sodium_mg:0, fiber_g:2.08, notes:"Tandoori paneer momos." },
  { food:"Samosa", cuisine:"North Indian", category:"snack", display_amount:"1 piece", grams_per_display:75.0, protein_g:4.5, carbs_g:21.0, fat_g:13.5, calories:225.0, sugar_g:3.78, sodium_mg:0, fiber_g:1.68, notes:"Potato-pea fried snack." },
  { food:"Seekh Kebab", cuisine:"North Indian", category:"snack", display_amount:"1 skewer", grams_per_display:80.0, protein_g:15.0, carbs_g:3.0, fat_g:10.0, calories:162.0, sugar_g:0.54, sodium_mg:0, fiber_g:0.24, notes:"Spiced minced meat kebab." },
  { food:"Veg Momos Fried", cuisine:"North Indian", category:"snack", display_amount:"6 pieces", grams_per_display:180.0, protein_g:8.0, carbs_g:32.0, fat_g:10.0, calories:260.0, sugar_g:5.76, sodium_mg:0, fiber_g:2.56, notes:"Fried vegetable momos." },
  { food:"Veg Momos Steamed", cuisine:"North Indian", category:"snack", display_amount:"6 pieces", grams_per_display:180.0, protein_g:8.0, carbs_g:30.0, fat_g:4.0, calories:190.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Steamed vegetable momos." },
  { food:"Veg Momos Tandoori", cuisine:"North Indian", category:"snack", display_amount:"6 pieces", grams_per_display:180.0, protein_g:9.0, carbs_g:28.0, fat_g:7.0, calories:220.0, sugar_g:5.04, sodium_mg:0, fiber_g:2.24, notes:"Tandoori vegetable momos." },
  { food:"Butter Popcorn", cuisine:"Snack", category:"snack", display_amount:"1 bowl", grams_per_display:30.0, protein_g:3.0, carbs_g:20.0, fat_g:8.0, calories:150.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Butter-coated popcorn." },
  { food:"Caramel Popcorn", cuisine:"Snack", category:"snack", display_amount:"1 bowl", grams_per_display:35.0, protein_g:2.0, carbs_g:28.0, fat_g:6.0, calories:180.0, sugar_g:5.04, sodium_mg:0, fiber_g:2.24, notes:"Sweet caramel popcorn." },
  { food:"Cheese Popcorn", cuisine:"Snack", category:"snack", display_amount:"1 bowl", grams_per_display:35.0, protein_g:4.0, carbs_g:25.0, fat_g:9.0, calories:180.0, sugar_g:4.5, sodium_mg:0, fiber_g:2.0, notes:"Cheese-flavored popcorn." },
  { food:"Popcorn (Air-Popped)", cuisine:"Snack", category:"snack", display_amount:"1 bowl", grams_per_display:25.0, protein_g:0.75, carbs_g:4.5, fat_g:0.25, calories:23.75, sugar_g:0.81, sodium_mg:0, fiber_g:0.36, notes:"Air-popped popcorn bowl." },
  { food:"Popcorn (Butter)", cuisine:"Snack", category:"snack", display_amount:"1 bowl", grams_per_display:30.0, protein_g:0.9, carbs_g:6.0, fat_g:1.8, calories:48.0, sugar_g:1.08, sodium_mg:0, fiber_g:0.48, notes:"Buttered popcorn bowl." },
  { food:"Popcorn Air-Popped", cuisine:"Snack", category:"snack", display_amount:"1 bowl", grams_per_display:20.0, protein_g:2.0, carbs_g:15.0, fat_g:1.0, calories:80.0, sugar_g:2.7, sodium_mg:0, fiber_g:1.2, notes:"Plain air-popped popcorn." },
  { food:"Banana Chips", cuisine:"South Indian", category:"snack", display_amount:"1 bowl", grams_per_display:30.0, protein_g:1.0, carbs_g:18.0, fat_g:9.0, calories:160.0, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Fried banana chips." },
  { food:"Curd Vada", cuisine:"South Indian", category:"snack", display_amount:"2 pieces", grams_per_display:120.0, protein_g:7.0, carbs_g:16.0, fat_g:8.0, calories:164.0, sugar_g:2.88, sodium_mg:0, fiber_g:1.28, notes:"Medu vada soaked in curd." },
  { food:"Masala Vada", cuisine:"South Indian", category:"snack", display_amount:"1 piece", grams_per_display:45.0, protein_g:4.0, carbs_g:11.0, fat_g:7.0, calories:123.0, sugar_g:1.98, sodium_mg:0, fiber_g:0.88, notes:"Fried chana dal vada." },
  { food:"Medu Vada", cuisine:"South Indian", category:"snack", display_amount:"1 piece", grams_per_display:50.0, protein_g:3.0, carbs_g:13.0, fat_g:7.5, calories:140.0, sugar_g:2.34, sodium_mg:0, fiber_g:1.04, notes:"Fried lentil vada." },
  { food:"Mirchi Bajji", cuisine:"South Indian", category:"snack", display_amount:"1 piece", grams_per_display:60.0, protein_g:3.0, carbs_g:14.0, fat_g:7.0, calories:130.0, sugar_g:2.52, sodium_mg:0, fiber_g:1.12, notes:"Chilli fritter, deep fried." },
  { food:"Murukku", cuisine:"South Indian", category:"snack", display_amount:"1 piece", grams_per_display:25.0, protein_g:1.0, carbs_g:15.0, fat_g:6.0, calories:110.0, sugar_g:2.7, sodium_mg:0, fiber_g:1.2, notes:"Crispy rice-flour snack." },
  { food:"Paniyaram", cuisine:"South Indian", category:"snack", display_amount:"3 pieces", grams_per_display:90.0, protein_g:4.0, carbs_g:15.0, fat_g:4.0, calories:112.0, sugar_g:2.7, sodium_mg:0, fiber_g:1.2, notes:"Pan-fried rice batter balls." },
  { food:"Croquetas", cuisine:"Spanish", category:"snack", display_amount:"4 pieces", grams_per_display:100.0, protein_g:7.0, carbs_g:20.0, fat_g:15.0, calories:240.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Creamy fried croquettes." },
  { food:"Pan con Tomate", cuisine:"Spanish", category:"snack", display_amount:"1 serving", grams_per_display:80.0, protein_g:3.2, carbs_g:20.8, fat_g:5.6, calories:144.0, sugar_g:3.74, sodium_mg:0, fiber_g:1.66, notes:"Bread with tomato and oil." },
  { food:"Bhel Puri", cuisine:"Street Food", category:"snack", display_amount:"1 bowl", grams_per_display:150.0, protein_g:4.0, carbs_g:28.0, fat_g:8.0, calories:200.0, sugar_g:5.04, sodium_mg:0, fiber_g:2.24, notes:"Puffed rice snack mix." },
  { food:"Dahi Puri", cuisine:"Street Food", category:"snack", display_amount:"6 pieces", grams_per_display:150.0, protein_g:4.0, carbs_g:25.0, fat_g:10.0, calories:206.0, sugar_g:4.5, sodium_mg:0, fiber_g:2.0, notes:"Pani puri with curd." },
  { food:"Egg Roll", cuisine:"Street Food", category:"snack", display_amount:"1 roll", grams_per_display:180.0, protein_g:14.0, carbs_g:28.0, fat_g:14.0, calories:290.0, sugar_g:5.04, sodium_mg:0, fiber_g:2.24, notes:"Egg and paratha roll." },
  { food:"Pani Puri", cuisine:"Street Food", category:"snack", display_amount:"6 pieces", grams_per_display:120.0, protein_g:3.0, carbs_g:30.0, fat_g:8.0, calories:204.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Golgappa/puchka snack." },
  { food:"Sev Puri", cuisine:"Street Food", category:"snack", display_amount:"1 plate", grams_per_display:120.0, protein_g:3.0, carbs_g:25.0, fat_g:10.0, calories:202.0, sugar_g:4.5, sodium_mg:0, fiber_g:2.0, notes:"Chaat with sev and chutneys." },
  { food:"Hummus", cuisine:"Vegan", category:"snack", display_amount:"2 tbsp", grams_per_display:30.0, protein_g:2.0, carbs_g:4.0, fat_g:5.0, calories:70.0, sugar_g:0.72, sodium_mg:0, fiber_g:0.32, notes:"Chickpea dip." },
  { food:"Bobotie", cuisine:"African", category:"meal", display_amount:"1 serving", grams_per_display:250.0, protein_g:18.0, carbs_g:20.0, fat_g:18.0, calories:320.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"South African baked meat dish." },
  { food:"Bunny Chow", cuisine:"African", category:"meal", display_amount:"1 serving", grams_per_display:300.0, protein_g:12.0, carbs_g:55.0, fat_g:16.0, calories:430.0, sugar_g:9.9, sodium_mg:0, fiber_g:4.4, notes:"Curry served in bread bowl." },
  { food:"Jollof Rice", cuisine:"African", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:7.0, carbs_g:45.0, fat_g:8.0, calories:300.0, sugar_g:8.1, sodium_mg:0, fiber_g:3.6, notes:"West African tomato rice." },
  { food:"Arabic Chicken Platter", cuisine:"Arabian", category:"meal", display_amount:"1 plate", grams_per_display:350.0, protein_g:28.0, carbs_g:45.0, fat_g:18.0, calories:500.0, sugar_g:8.1, sodium_mg:0, fiber_g:3.6, notes:"Chicken with rice and sides." },
  { food:"Chicken Shawarma", cuisine:"Arabian", category:"meal", display_amount:"1 wrap", grams_per_display:250.0, protein_g:24.0, carbs_g:30.0, fat_g:12.0, calories:330.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Chicken wrap with garlic sauce and vegetables." },
  { food:"Falafel Wrap", cuisine:"Arabian", category:"meal", display_amount:"1 wrap", grams_per_display:250.0, protein_g:12.0, carbs_g:40.0, fat_g:14.0, calories:350.0, sugar_g:7.2, sodium_mg:0, fiber_g:3.2, notes:"Wrap with falafel and sauces." },
  { food:"Hummus Pita", cuisine:"Arabian", category:"meal", display_amount:"1 wrap", grams_per_display:220.0, protein_g:10.0, carbs_g:35.0, fat_g:10.0, calories:300.0, sugar_g:6.3, sodium_mg:0, fiber_g:2.8, notes:"Pita with hummus." },
  { food:"Paneer Shawarma", cuisine:"Arabian", category:"meal", display_amount:"1 wrap", grams_per_display:240.0, protein_g:16.0, carbs_g:32.0, fat_g:14.0, calories:340.0, sugar_g:5.76, sodium_mg:0, fiber_g:2.56, notes:"Paneer wrap with sauce and vegetables." },
  { food:"Veg Shawarma", cuisine:"Arabian", category:"meal", display_amount:"1 wrap", grams_per_display:220.0, protein_g:10.0, carbs_g:34.0, fat_g:10.0, calories:260.0, sugar_g:6.12, sodium_mg:0, fiber_g:2.72, notes:"Vegetable wrap with tahini/garlic sauce." },
  { food:"Aloo Posto", cuisine:"Bengali", category:"meal", display_amount:"1 bowl", grams_per_display:150.0, protein_g:3.0, carbs_g:14.0, fat_g:8.0, calories:140.0, sugar_g:2.52, sodium_mg:0, fiber_g:1.12, notes:"Potato with poppy seed paste." },
  { food:"Bengali Khichuri", cuisine:"Bengali", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:8.0, carbs_g:40.0, fat_g:10.0, calories:282.0, sugar_g:7.2, sodium_mg:0, fiber_g:3.2, notes:"Moong dal and rice khichdi." },
  { food:"Shorshe Ilish", cuisine:"Bengali", category:"meal", display_amount:"1 piece", grams_per_display:180.0, protein_g:24.0, carbs_g:4.0, fat_g:18.0, calories:274.0, sugar_g:0.72, sodium_mg:0, fiber_g:0.32, notes:"Hilsa fish in mustard gravy." },
  { food:"Chicken Chow Mein", cuisine:"Chinese", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:17.0, carbs_g:44.0, fat_g:10.0, calories:350.0, sugar_g:7.92, sodium_mg:0, fiber_g:3.52, notes:"Chicken stir-fried noodles." },
  { food:"Chow Mein", cuisine:"Chinese", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:22.5, carbs_g:130.0, fat_g:35.0, calories:900.0, sugar_g:23.4, sodium_mg:0, fiber_g:10.4, notes:"Average chow mein." },
  { food:"Kung Pao Chicken", cuisine:"Chinese", category:"meal", display_amount:"1 bowl", grams_per_display:220.0, protein_g:20.0, carbs_g:15.0, fat_g:18.0, calories:300.0, sugar_g:2.7, sodium_mg:0, fiber_g:1.2, notes:"Spicy chicken with peanuts." },
  { food:"Veg Chow Mein", cuisine:"Chinese", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:7.0, carbs_g:44.0, fat_g:9.0, calories:300.0, sugar_g:7.92, sodium_mg:0, fiber_g:3.52, notes:"Stir-fried vegetable noodles." },
  { food:"Vegetable Fried Rice", cuisine:"Chinese", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:16.25, carbs_g:130.0, fat_g:27.5, calories:800.0, sugar_g:23.4, sodium_mg:0, fiber_g:10.4, notes:"Average veg fried rice." },
  { food:"Burger", cuisine:"Fast Food", category:"meal", display_amount:"1 burger", grams_per_display:180.0, protein_g:21.6, carbs_g:45.0, fat_g:21.6, calories:468.0, sugar_g:8.1, sodium_mg:0, fiber_g:3.6, notes:"Generic burger." },
  { food:"Cheese Burger", cuisine:"Fast Food", category:"meal", display_amount:"1 piece", grams_per_display:190.0, protein_g:15.0, carbs_g:31.0, fat_g:18.0, calories:380.0, sugar_g:5.58, sodium_mg:0, fiber_g:2.48, notes:"Cheeseburger." },
  { food:"Chicken Burger", cuisine:"Fast Food", category:"meal", display_amount:"1 piece", grams_per_display:180.0, protein_g:18.0, carbs_g:30.0, fat_g:14.0, calories:340.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Chicken burger." },
  { food:"Fried Chicken", cuisine:"Fast Food", category:"meal", display_amount:"1 piece", grams_per_display:120.0, protein_g:25.2, carbs_g:13.2, fat_g:16.8, calories:336.0, sugar_g:2.38, sodium_mg:0, fiber_g:1.06, notes:"Breaded fried chicken." },
  { food:"Hot Dog", cuisine:"Fast Food", category:"meal", display_amount:"1 hot dog", grams_per_display:120.0, protein_g:12.0, carbs_g:21.6, fat_g:16.8, calories:300.0, sugar_g:3.89, sodium_mg:0, fiber_g:1.73, notes:"Hot dog with bun." },
  { food:"Paneer Burger", cuisine:"Fast Food", category:"meal", display_amount:"1 piece", grams_per_display:180.0, protein_g:14.0, carbs_g:28.0, fat_g:16.0, calories:330.0, sugar_g:5.04, sodium_mg:0, fiber_g:2.24, notes:"Paneer burger." },
  { food:"Veg Burger", cuisine:"Fast Food", category:"meal", display_amount:"1 piece", grams_per_display:150.0, protein_g:8.0, carbs_g:28.0, fat_g:10.0, calories:250.0, sugar_g:5.04, sodium_mg:0, fiber_g:2.24, notes:"Vegetable burger." },
  { food:"Dal Dhokli", cuisine:"Gujarati", category:"meal", display_amount:"1 bowl", grams_per_display:250.0, protein_g:15.0, carbs_g:50.0, fat_g:15.0, calories:375.0, sugar_g:9.0, sodium_mg:0, fiber_g:4.0, notes:"Wheat dumplings in dal." },
  { food:"Handvo", cuisine:"Gujarati", category:"meal", display_amount:"1 piece", grams_per_display:100.0, protein_g:6.0, carbs_g:25.0, fat_g:11.0, calories:215.0, sugar_g:4.5, sodium_mg:0, fiber_g:2.0, notes:"Savory lentil-rice cake." },
  { food:"Sev Tameta", cuisine:"Gujarati", category:"meal", display_amount:"1 bowl", grams_per_display:150.0, protein_g:4.5, carbs_g:18.0, fat_g:15.0, calories:225.0, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Tomato gravy with sev." },
  { food:"Sev Usal", cuisine:"Gujarati", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:8.0, carbs_g:35.0, fat_g:14.0, calories:298.0, sugar_g:6.3, sodium_mg:0, fiber_g:2.8, notes:"Usal topped with sev." },
  { food:"Thepla with Curd", cuisine:"Gujarati", category:"meal", display_amount:"1 serving", grams_per_display:160.0, protein_g:8.0, carbs_g:28.0, fat_g:8.0, calories:216.0, sugar_g:5.04, sodium_mg:0, fiber_g:2.24, notes:"Thepla served with curd." },
  { food:"Undhiyu", cuisine:"Gujarati", category:"meal", display_amount:"1 bowl", grams_per_display:250.0, protein_g:7.5, carbs_g:35.0, fat_g:20.0, calories:325.0, sugar_g:6.3, sodium_mg:0, fiber_g:2.8, notes:"Mixed vegetable curry." },
  { food:"Egg Curry", cuisine:"Indian", category:"meal", display_amount:"1 bowl", grams_per_display:250.0, protein_g:15.0, carbs_g:8.0, fat_g:18.0, calories:250.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Eggs in spiced gravy." },
  { food:"Chicken Fried Rice", cuisine:"Indo-Chinese", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:18.0, carbs_g:45.0, fat_g:10.0, calories:350.0, sugar_g:8.1, sodium_mg:0, fiber_g:3.6, notes:"Chicken fried rice." },
  { food:"Chicken Manchurian", cuisine:"Indo-Chinese", category:"meal", display_amount:"1 cup", grams_per_display:200.0, protein_g:34.0, carbs_g:36.0, fat_g:30.0, calories:560.0, sugar_g:6.48, sodium_mg:0, fiber_g:2.88, notes:"Chicken manchurian." },
  { food:"Chilli Chicken", cuisine:"Indo-Chinese", category:"meal", display_amount:"1 plate", grams_per_display:220.0, protein_g:18.0, carbs_g:18.0, fat_g:16.0, calories:300.0, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Spicy chicken stir fry." },
  { food:"Chilli Paneer", cuisine:"Indo-Chinese", category:"meal", display_amount:"1 cup", grams_per_display:200.0, protein_g:28.0, carbs_g:36.0, fat_g:36.0, calories:560.0, sugar_g:6.48, sodium_mg:0, fiber_g:2.88, notes:"Chilli paneer, average." },
  { food:"Hakka Noodles", cuisine:"Indo-Chinese", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:8.0, carbs_g:45.0, fat_g:10.0, calories:320.0, sugar_g:8.1, sodium_mg:0, fiber_g:3.6, notes:"Stir-fried noodles." },
  { food:"Schezwan Noodles", cuisine:"Indo-Chinese", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:8.0, carbs_g:48.0, fat_g:11.0, calories:330.0, sugar_g:8.64, sodium_mg:0, fiber_g:3.84, notes:"Spicy noodles." },
  { food:"Veg Fried Rice", cuisine:"Indo-Chinese", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:7.0, carbs_g:45.0, fat_g:9.0, calories:300.0, sugar_g:8.1, sodium_mg:0, fiber_g:3.6, notes:"Vegetable fried rice." },
  { food:"Veg Manchurian", cuisine:"Indo-Chinese", category:"meal", display_amount:"1 cup", grams_per_display:200.0, protein_g:16.0, carbs_g:40.0, fat_g:24.0, calories:440.0, sugar_g:7.2, sodium_mg:0, fiber_g:3.2, notes:"Veg manchurian gravy/fry." },
  { food:"Lasagna", cuisine:"Italian", category:"meal", display_amount:"1 piece", grams_per_display:180.0, protein_g:14.4, carbs_g:27.0, fat_g:10.8, calories:270.0, sugar_g:4.86, sodium_mg:0, fiber_g:2.16, notes:"Generic meat/veg lasagna." },
  { food:"Pasta", cuisine:"Italian", category:"meal", display_amount:"1 cup", grams_per_display:140.0, protein_g:8.12, carbs_g:43.26, fat_g:1.4, calories:221.2, sugar_g:7.79, sodium_mg:0, fiber_g:3.46, notes:"Cooked pasta, generic." },
  { food:"Pizza", cuisine:"Italian", category:"meal", display_amount:"1 slice", grams_per_display:107.0, protein_g:12.2, carbs_g:35.63, fat_g:10.81, calories:284.6, sugar_g:6.41, sodium_mg:0, fiber_g:2.85, notes:"Cheese pizza slice, average." },
  { food:"Risotto", cuisine:"Italian", category:"meal", display_amount:"1 bowl", grams_per_display:220.0, protein_g:6.6, carbs_g:55.0, fat_g:11.0, calories:330.0, sugar_g:9.9, sodium_mg:0, fiber_g:4.4, notes:"Creamy rice risotto." },
  { food:"Spaghetti", cuisine:"Italian", category:"meal", display_amount:"1 cup", grams_per_display:140.0, protein_g:8.12, carbs_g:43.26, fat_g:1.4, calories:221.2, sugar_g:7.79, sodium_mg:0, fiber_g:3.46, notes:"Cooked spaghetti." },
  { food:"California Roll", cuisine:"Japanese", category:"meal", display_amount:"1 roll (8 pieces)", grams_per_display:240.0, protein_g:10.0, carbs_g:38.0, fat_g:7.0, calories:270.0, sugar_g:6.84, sodium_mg:0, fiber_g:3.04, notes:"Average California roll." },
  { food:"Katsu Curry", cuisine:"Japanese", category:"meal", display_amount:"1 serving", grams_per_display:350.0, protein_g:18.0, carbs_g:50.0, fat_g:18.0, calories:450.0, sugar_g:9.0, sodium_mg:0, fiber_g:4.0, notes:"Japanese curry with cutlet." },
  { food:"Ramen", cuisine:"Japanese", category:"meal", display_amount:"1 bowl", grams_per_display:450.0, protein_g:15.0, carbs_g:65.0, fat_g:15.0, calories:480.0, sugar_g:11.7, sodium_mg:0, fiber_g:5.2, notes:"Average ramen bowl." },
  { food:"Sushi (Average)", cuisine:"Japanese", category:"meal", display_amount:"6 pieces", grams_per_display:180.0, protein_g:18.0, carbs_g:54.0, fat_g:12.6, calories:432.0, sugar_g:9.72, sodium_mg:0, fiber_g:4.32, notes:"Average sushi assortment." },
  { food:"Sushi Roll (Average)", cuisine:"Japanese", category:"meal", display_amount:"1 roll (8 pieces)", grams_per_display:250.0, protein_g:13.0, carbs_g:40.0, fat_g:6.0, calories:280.0, sugar_g:7.2, sodium_mg:0, fiber_g:3.2, notes:"Average maki roll." },
  { food:"Teriyaki Chicken Bowl", cuisine:"Japanese", category:"meal", display_amount:"1 bowl", grams_per_display:350.0, protein_g:70.0, carbs_g:182.0, fat_g:35.0, calories:1470.0, sugar_g:32.76, sodium_mg:0, fiber_g:14.56, notes:"Average teriyaki chicken bowl." },
  { food:"Udon", cuisine:"Japanese", category:"meal", display_amount:"1 bowl", grams_per_display:400.0, protein_g:12.0, carbs_g:58.0, fat_g:10.0, calories:390.0, sugar_g:10.44, sodium_mg:0, fiber_g:4.64, notes:"Average udon bowl." },
  { food:"Tomato Bath", cuisine:"Karnataka", category:"meal", display_amount:"1 cup", grams_per_display:200.0, protein_g:8.0, carbs_g:80.0, fat_g:18.0, calories:520.0, sugar_g:14.4, sodium_mg:0, fiber_g:6.4, notes:"Tomato rice, average." },
  { food:"Wangibath", cuisine:"Karnataka", category:"meal", display_amount:"1 cup", grams_per_display:200.0, protein_g:9.0, carbs_g:76.0, fat_g:20.0, calories:560.0, sugar_g:13.68, sodium_mg:0, fiber_g:6.08, notes:"Brinjal rice, average." },
  { food:"Bibimbap", cuisine:"Korean", category:"meal", display_amount:"1 bowl", grams_per_display:400.0, protein_g:18.0, carbs_g:60.0, fat_g:12.0, calories:470.0, sugar_g:10.8, sodium_mg:0, fiber_g:4.8, notes:"Mixed rice bowl." },
  { food:"Japchae", cuisine:"Korean", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:6.0, carbs_g:40.0, fat_g:8.0, calories:270.0, sugar_g:7.2, sodium_mg:0, fiber_g:3.2, notes:"Glass noodles with vegetables." },
  { food:"Kimbap", cuisine:"Korean", category:"meal", display_amount:"1 roll", grams_per_display:250.0, protein_g:10.0, carbs_g:45.0, fat_g:8.0, calories:300.0, sugar_g:8.1, sodium_mg:0, fiber_g:3.6, notes:"Seaweed rice roll." },
  { food:"Kimchi Fried Rice", cuisine:"Korean", category:"meal", display_amount:"1 plate", grams_per_display:300.0, protein_g:10.0, carbs_g:50.0, fat_g:12.0, calories:340.0, sugar_g:9.0, sodium_mg:0, fiber_g:4.0, notes:"Rice cooked with kimchi." },
  { food:"Amti", cuisine:"Marathi", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:9.0, carbs_g:24.0, fat_g:8.0, calories:180.0, sugar_g:4.32, sodium_mg:0, fiber_g:1.92, notes:"Maharashtrian dal curry." },
  { food:"Bharli Vangi", cuisine:"Marathi", category:"meal", display_amount:"1 bowl", grams_per_display:150.0, protein_g:3.75, carbs_g:13.5, fat_g:12.0, calories:165.0, sugar_g:2.43, sodium_mg:0, fiber_g:1.08, notes:"Stuffed eggplant curry." },
  { food:"Kolhapuri Chicken", cuisine:"Marathi", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:25.0, carbs_g:8.0, fat_g:18.0, calories:294.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Spicy chicken curry." },
  { food:"Kolhapuri Mutton", cuisine:"Marathi", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:24.0, carbs_g:6.0, fat_g:20.0, calories:300.0, sugar_g:1.08, sodium_mg:0, fiber_g:0.48, notes:"Spicy mutton curry." },
  { food:"Misal Pav", cuisine:"Marathi", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:17.5, carbs_g:70.0, fat_g:30.0, calories:600.0, sugar_g:12.6, sodium_mg:0, fiber_g:5.6, notes:"Spicy sprout curry with bread." },
  { food:"Pithla Bhakri", cuisine:"Marathi", category:"meal", display_amount:"1 plate", grams_per_display:300.0, protein_g:10.0, carbs_g:40.0, fat_g:12.0, calories:308.0, sugar_g:7.2, sodium_mg:0, fiber_g:3.2, notes:"Gram flour gravy with flatbread." },
  { food:"Zunka Bhakri", cuisine:"Marathi", category:"meal", display_amount:"1 plate", grams_per_display:300.0, protein_g:12.0, carbs_g:38.0, fat_g:12.0, calories:308.0, sugar_g:6.84, sodium_mg:0, fiber_g:3.04, notes:"Dry gram flour curry with bhakri." },
  { food:"Shawarma Plate", cuisine:"Middle Eastern", category:"meal", display_amount:"1 plate", grams_per_display:400.0, protein_g:96.0, carbs_g:220.0, fat_g:100.0, calories:2480.0, sugar_g:39.6, sodium_mg:0, fiber_g:17.6, notes:"Shawarma with rice/fries/salad, average." },
  { food:"Bamboo Shoot Curry", cuisine:"North Eastern", category:"meal", display_amount:"1 bowl", grams_per_display:150.0, protein_g:3.0, carbs_g:7.5, fat_g:4.5, calories:90.0, sugar_g:1.35, sodium_mg:0, fiber_g:0.6, notes:"Light bamboo-shoot dish." },
  { food:"Chicken Thukpa", cuisine:"North Eastern", category:"meal", display_amount:"1 bowl", grams_per_display:250.0, protein_g:12.5, carbs_g:60.0, fat_g:12.5, calories:400.0, sugar_g:10.8, sodium_mg:0, fiber_g:4.8, notes:"Chicken noodle soup." },
  { food:"Fish Curry", cuisine:"North Eastern", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:36.0, carbs_g:12.0, fat_g:20.0, calories:380.0, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Regional fish curry." },
  { food:"Fish Tenga", cuisine:"North Eastern", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:18.0, carbs_g:8.0, fat_g:8.0, calories:176.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Sour Assamese fish curry." },
  { food:"Pork Curry", cuisine:"North Eastern", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:40.0, carbs_g:8.0, fat_g:32.0, calories:500.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Regional pork curry." },
  { food:"Smoked Pork Curry", cuisine:"North Eastern", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:20.0, carbs_g:5.0, fat_g:20.0, calories:280.0, sugar_g:0.9, sodium_mg:0, fiber_g:0.4, notes:"Pork curry, smoky preparation." },
  { food:"Thukpa Chicken", cuisine:"North Eastern", category:"meal", display_amount:"1 bowl", grams_per_display:300.0, protein_g:18.0, carbs_g:42.0, fat_g:8.0, calories:312.0, sugar_g:7.56, sodium_mg:0, fiber_g:3.36, notes:"Chicken noodle soup." },
  { food:"Thukpa Veg", cuisine:"North Eastern", category:"meal", display_amount:"1 bowl", grams_per_display:300.0, protein_g:8.0, carbs_g:45.0, fat_g:6.0, calories:266.0, sugar_g:8.1, sodium_mg:0, fiber_g:3.6, notes:"Vegetable noodle soup." },
  { food:"Veg Thukpa", cuisine:"North Eastern", category:"meal", display_amount:"1 bowl", grams_per_display:250.0, protein_g:8.75, carbs_g:55.0, fat_g:10.0, calories:350.0, sugar_g:9.9, sodium_mg:0, fiber_g:4.4, notes:"Noodle soup." },
  { food:"Aloo Dum Biryani", cuisine:"North Indian", category:"meal", display_amount:"1 plate", grams_per_display:300.0, protein_g:7.0, carbs_g:55.0, fat_g:12.0, calories:380.0, sugar_g:9.9, sodium_mg:0, fiber_g:4.4, notes:"Potato biryani average." },
  { food:"Aloo Gobi", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:180.0, protein_g:4.0, carbs_g:16.0, fat_g:8.0, calories:152.0, sugar_g:2.88, sodium_mg:0, fiber_g:1.28, notes:"Potato cauliflower curry." },
  { food:"Baingan Bharta", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:180.0, protein_g:3.0, carbs_g:14.0, fat_g:8.0, calories:140.0, sugar_g:2.52, sodium_mg:0, fiber_g:1.12, notes:"Smoky mashed eggplant curry." },
  { food:"Bhindi Masala", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:150.0, protein_g:3.0, carbs_g:10.0, fat_g:7.0, calories:115.0, sugar_g:1.8, sodium_mg:0, fiber_g:0.8, notes:"Okra stir-fry/curry." },
  { food:"Butter Chicken", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:36.0, carbs_g:16.0, fat_g:40.0, calories:540.0, sugar_g:2.88, sodium_mg:0, fiber_g:1.28, notes:"Chicken in butter-cream gravy." },
  { food:"Chicken Biryani", cuisine:"North Indian", category:"meal", display_amount:"1 plate", grams_per_display:300.0, protein_g:16.5, carbs_g:72.0, fat_g:24.0, calories:480.0, sugar_g:12.96, sodium_mg:0, fiber_g:5.76, notes:"Typical mixed chicken biryani." },
  { food:"Chole", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:16.0, carbs_g:48.0, fat_g:10.0, calories:300.0, sugar_g:8.64, sodium_mg:0, fiber_g:3.84, notes:"Chickpea curry." },
  { food:"Chole Bhature", cuisine:"North Indian", category:"meal", display_amount:"1 plate", grams_per_display:400.0, protein_g:16.0, carbs_g:72.0, fat_g:24.0, calories:568.0, sugar_g:12.96, sodium_mg:0, fiber_g:5.76, notes:"Chickpeas with fried bread, plated meal." },
  { food:"Chole Rice", cuisine:"North Indian", category:"meal", display_amount:"1 plate", grams_per_display:350.0, protein_g:15.0, carbs_g:70.0, fat_g:8.0, calories:412.0, sugar_g:12.6, sodium_mg:0, fiber_g:5.6, notes:"Chickpeas with rice." },
  { food:"Dal Makhani", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:10.0, carbs_g:20.0, fat_g:14.0, calories:246.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Creamy black lentil curry." },
  { food:"Dal Tadka", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:11.0, carbs_g:24.0, fat_g:10.0, calories:220.0, sugar_g:4.32, sodium_mg:0, fiber_g:1.92, notes:"Cooked lentils with tempering." },
  { food:"Kadhi Pakora", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:220.0, protein_g:7.0, carbs_g:18.0, fat_g:10.0, calories:190.0, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Yogurt curry with fritters." },
  { food:"Matar Paneer", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:12.0, carbs_g:12.0, fat_g:14.0, calories:222.0, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Peas and paneer curry." },
  { food:"Palak Paneer", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:12.0, carbs_g:10.0, fat_g:16.0, calories:232.0, sugar_g:1.8, sodium_mg:0, fiber_g:0.8, notes:"Spinach paneer curry." },
  { food:"Paneer Bhurji", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:180.0, protein_g:15.0, carbs_g:8.0, fat_g:18.0, calories:254.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Scrambled spiced paneer." },
  { food:"Paneer Butter Masala", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:16.0, carbs_g:20.0, fat_g:36.0, calories:480.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Creamy paneer curry." },
  { food:"Rajma Chawal", cuisine:"North Indian", category:"meal", display_amount:"1 plate", grams_per_display:400.0, protein_g:18.0, carbs_g:74.0, fat_g:8.0, calories:440.0, sugar_g:13.32, sodium_mg:0, fiber_g:5.92, notes:"Kidney beans with rice." },
  { food:"Rajma Curry", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:17.0, carbs_g:44.0, fat_g:8.0, calories:280.0, sugar_g:7.92, sodium_mg:0, fiber_g:3.52, notes:"Kidney bean curry." },
  { food:"Sarson da Saag", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:180.0, protein_g:4.0, carbs_g:12.0, fat_g:8.0, calories:136.0, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Mustard greens curry." },
  { food:"Tandoori Chicken", cuisine:"North Indian", category:"meal", display_amount:"1 piece", grams_per_display:120.0, protein_g:28.0, carbs_g:3.0, fat_g:7.0, calories:187.0, sugar_g:0.54, sodium_mg:0, fiber_g:0.24, notes:"Tandoor-roasted chicken portion." },
  { food:"Vegetable Biryani", cuisine:"North Indian", category:"meal", display_amount:"1 plate", grams_per_display:300.0, protein_g:11.4, carbs_g:72.0, fat_g:18.0, calories:435.0, sugar_g:12.96, sodium_mg:0, fiber_g:5.76, notes:"Typical mixed vegetable biryani." },
  { food:"Vegetable Khichdi", cuisine:"North Indian", category:"meal", display_amount:"1 bowl", grams_per_display:250.0, protein_g:8.75, carbs_g:50.0, fat_g:8.75, calories:300.0, sugar_g:9.0, sodium_mg:0, fiber_g:4.0, notes:"Rice-lentil khichdi." },
  { food:"Bisibelebath", cuisine:"South Indian", category:"meal", display_amount:"1 plate", grams_per_display:300.0, protein_g:8.0, carbs_g:50.0, fat_g:10.0, calories:322.0, sugar_g:9.0, sodium_mg:0, fiber_g:4.0, notes:"Rice-lentil-vegetable one-pot meal." },
  { food:"Chicken Chettinad", cuisine:"South Indian", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:24.0, carbs_g:6.0, fat_g:18.0, calories:282.0, sugar_g:1.08, sodium_mg:0, fiber_g:0.48, notes:"Spiced chicken curry." },
  { food:"Curd Rice", cuisine:"South Indian", category:"meal", display_amount:"1 bowl", grams_per_display:250.0, protein_g:8.0, carbs_g:45.0, fat_g:10.0, calories:325.0, sugar_g:8.1, sodium_mg:0, fiber_g:3.6, notes:"Cooked rice mixed with curd." },
  { food:"Fish Moilee", cuisine:"South Indian", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:20.0, carbs_g:6.0, fat_g:18.0, calories:266.0, sugar_g:1.08, sodium_mg:0, fiber_g:0.48, notes:"Fish curry with coconut milk." },
  { food:"Lemon Rice", cuisine:"South Indian", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:4.5, carbs_g:44.0, fat_g:10.0, calories:284.0, sugar_g:7.92, sodium_mg:0, fiber_g:3.52, notes:"Seasoned rice with lemon, curry leaves and peanuts." },
  { food:"Prawn Curry", cuisine:"South Indian", category:"meal", display_amount:"1 bowl", grams_per_display:200.0, protein_g:20.0, carbs_g:6.0, fat_g:14.0, calories:230.0, sugar_g:1.08, sodium_mg:0, fiber_g:0.48, notes:"Prawn curry with coconut/spice base." },
  { food:"Puliyogare", cuisine:"South Indian", category:"meal", display_amount:"1 cup", grams_per_display:200.0, protein_g:8.0, carbs_g:84.0, fat_g:16.0, calories:520.0, sugar_g:15.12, sodium_mg:0, fiber_g:6.72, notes:"Tamarind rice." },
  { food:"Tamarind Rice", cuisine:"South Indian", category:"meal", display_amount:"1 plate", grams_per_display:250.0, protein_g:4.0, carbs_g:48.0, fat_g:11.0, calories:307.0, sugar_g:8.64, sodium_mg:0, fiber_g:3.84, notes:"Puliyodarai-style tamarind rice." },
  { food:"Paella", cuisine:"Spanish", category:"meal", display_amount:"1 bowl", grams_per_display:250.0, protein_g:16.25, carbs_g:50.0, fat_g:15.0, calories:400.0, sugar_g:9.0, sodium_mg:0, fiber_g:4.0, notes:"Generic mixed paella." },
  { food:"Tortilla Espanola", cuisine:"Spanish", category:"meal", display_amount:"1 slice", grams_per_display:120.0, protein_g:7.2, carbs_g:16.8, fat_g:12.0, calories:204.0, sugar_g:3.02, sodium_mg:0, fiber_g:1.34, notes:"Potato-egg omelette." },
  { food:"Kathi Roll", cuisine:"Street Food", category:"meal", display_amount:"1 roll", grams_per_display:200.0, protein_g:15.0, carbs_g:35.0, fat_g:15.0, calories:335.0, sugar_g:6.3, sodium_mg:0, fiber_g:2.8, notes:"Paratha roll with filling." },
  { food:"Tofu Scramble", cuisine:"Vegan", category:"meal", display_amount:"1 serving", grams_per_display:150.0, protein_g:10.0, carbs_g:4.0, fat_g:8.0, calories:120.0, sugar_g:0.72, sodium_mg:0, fiber_g:0.32, notes:"Seasoned tofu scramble." },
  { food:"Baked Beans", cuisine:"Western", category:"meal", display_amount:"1 cup", grams_per_display:240.0, protein_g:11.28, carbs_g:50.4, fat_g:1.2, calories:264.0, sugar_g:9.07, sodium_mg:0, fiber_g:4.03, notes:"Sweet baked beans." },
  { food:"Chicken Burrito", cuisine:"Western", category:"meal", display_amount:"1 burrito", grams_per_display:280.0, protein_g:24.0, carbs_g:40.0, fat_g:14.0, calories:420.0, sugar_g:7.2, sodium_mg:0, fiber_g:3.2, notes:"Chicken burrito." },
  { food:"Fish and Chips", cuisine:"Western", category:"meal", display_amount:"1 plate", grams_per_display:350.0, protein_g:42.0, carbs_g:87.5, fat_g:52.5, calories:875.0, sugar_g:15.75, sodium_mg:0, fiber_g:7.0, notes:"Average pub-style serving." },
  { food:"Paneer Burrito", cuisine:"Western", category:"meal", display_amount:"1 burrito", grams_per_display:270.0, protein_g:18.0, carbs_g:42.0, fat_g:16.0, calories:400.0, sugar_g:7.56, sodium_mg:0, fiber_g:3.36, notes:"Paneer burrito." },
  { food:"Sandwich", cuisine:"Western", category:"meal", display_amount:"1 sandwich", grams_per_display:160.0, protein_g:14.4, carbs_g:35.2, fat_g:16.0, calories:352.0, sugar_g:6.34, sodium_mg:0, fiber_g:2.82, notes:"Generic sandwich." },
  { food:"Veg Burrito", cuisine:"Western", category:"meal", display_amount:"1 burrito", grams_per_display:250.0, protein_g:12.0, carbs_g:45.0, fat_g:12.0, calories:350.0, sugar_g:8.1, sodium_mg:0, fiber_g:3.6, notes:"Vegetable burrito." },
  { food:"Gujarati Kadhi", cuisine:"Gujarati", category:"side dish", display_amount:"1 cup", grams_per_display:200.0, protein_g:4.0, carbs_g:10.0, fat_g:7.0, calories:119.0, sugar_g:1.8, sodium_mg:0, fiber_g:0.8, notes:"Thin sweet-sour yogurt curry." },
  { food:"Kimchi", cuisine:"Korean", category:"side dish", display_amount:"1 cup", grams_per_display:150.0, protein_g:2.0, carbs_g:6.0, fat_g:1.0, calories:35.0, sugar_g:1.08, sodium_mg:0, fiber_g:0.48, notes:"Fermented cabbage." },
  { food:"Batata Bhaji", cuisine:"Marathi", category:"side dish", display_amount:"1 bowl", grams_per_display:150.0, protein_g:3.0, carbs_g:18.0, fat_g:7.0, calories:147.0, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Spiced potato preparation." },
  { food:"Bamboo Shoot Curry (Northeast style)", cuisine:"North Eastern", category:"side dish", display_amount:"1 bowl", grams_per_display:150.0, protein_g:2.0, carbs_g:8.0, fat_g:5.0, calories:85.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Bamboo shoot vegetable curry." },
  { food:"Avial", cuisine:"South Indian", category:"side dish", display_amount:"1 bowl", grams_per_display:150.0, protein_g:3.0, carbs_g:12.0, fat_g:8.0, calories:132.0, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Mixed vegetables in coconut-yogurt base." },
  { food:"Coconut Chutney", cuisine:"South Indian", category:"side dish", display_amount:"2 tbsp", grams_per_display:30.0, protein_g:0.9, carbs_g:2.7, fat_g:3.6, calories:51.0, sugar_g:0.49, sodium_mg:0, fiber_g:0.22, notes:"Coconut chutney, averaged." },
  { food:"Kootu", cuisine:"South Indian", category:"side dish", display_amount:"1 bowl", grams_per_display:180.0, protein_g:5.0, carbs_g:14.0, fat_g:5.0, calories:121.0, sugar_g:2.52, sodium_mg:0, fiber_g:1.12, notes:"Vegetable and lentil stew." },
  { food:"Poriyal", cuisine:"South Indian", category:"side dish", display_amount:"1 bowl", grams_per_display:100.0, protein_g:2.0, carbs_g:6.0, fat_g:4.0, calories:68.0, sugar_g:1.08, sodium_mg:0, fiber_g:0.48, notes:"Vegetable stir-fry, lightly seasoned." },
  { food:"Rasam", cuisine:"South Indian", category:"side dish", display_amount:"1 cup", grams_per_display:240.0, protein_g:2.4, carbs_g:9.6, fat_g:2.4, calories:72.0, sugar_g:1.73, sodium_mg:0, fiber_g:0.77, notes:"Tomato/tamarind rasam." },
  { food:"Rasam (spiced)", cuisine:"South Indian", category:"side dish", display_amount:"1 cup", grams_per_display:240.0, protein_g:1.2, carbs_g:5.5, fat_g:1.0, calories:35.8, sugar_g:0.99, sodium_mg:0, fiber_g:0.44, notes:"Tomato/tamarind rasam, thin soup." },
  { food:"Sambar", cuisine:"South Indian", category:"side dish", display_amount:"1 cup", grams_per_display:240.0, protein_g:6.48, carbs_g:19.2, fat_g:6.0, calories:139.2, sugar_g:3.46, sodium_mg:0, fiber_g:1.54, notes:"Vegetable sambar." },
  { food:"Sambar (thick)", cuisine:"South Indian", category:"side dish", display_amount:"1 cup", grams_per_display:240.0, protein_g:5.0, carbs_g:14.0, fat_g:4.5, calories:116.5, sugar_g:2.52, sodium_mg:0, fiber_g:1.12, notes:"Vegetable sambar, lentil-based." },
  { food:"Thoran", cuisine:"South Indian", category:"side dish", display_amount:"1 bowl", grams_per_display:120.0, protein_g:2.0, carbs_g:8.0, fat_g:6.0, calories:94.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Dry vegetable stir-fry with coconut." },
  { food:"Egusi Soup", cuisine:"African", category:"soup", display_amount:"1 bowl", grams_per_display:250.0, protein_g:12.0, carbs_g:10.0, fat_g:18.0, calories:250.0, sugar_g:1.8, sodium_mg:0, fiber_g:0.8, notes:"Melon seed soup." },
  { food:"Hot and Sour Soup", cuisine:"Chinese", category:"soup", display_amount:"1 bowl", grams_per_display:250.0, protein_g:4.0, carbs_g:10.0, fat_g:4.0, calories:90.0, sugar_g:1.8, sodium_mg:0, fiber_g:0.8, notes:"Spiced soup." },
  { food:"Sweet Corn Soup", cuisine:"Chinese", category:"soup", display_amount:"1 bowl", grams_per_display:250.0, protein_g:4.0, carbs_g:18.0, fat_g:3.0, calories:120.0, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Chinese sweet corn soup." },
  { food:"Wonton Soup", cuisine:"Chinese", category:"soup", display_amount:"1 bowl", grams_per_display:250.0, protein_g:7.0, carbs_g:12.0, fat_g:4.0, calories:110.0, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Soup with wontons." },
  { food:"Miso Soup", cuisine:"Japanese", category:"soup", display_amount:"1 bowl", grams_per_display:240.0, protein_g:3.0, carbs_g:5.0, fat_g:2.0, calories:45.0, sugar_g:0.9, sodium_mg:0, fiber_g:0.4, notes:"Light miso broth." },
  { food:"Mutton Soup", cuisine:"North Indian", category:"soup", display_amount:"1 bowl", grams_per_display:250.0, protein_g:16.0, carbs_g:8.0, fat_g:10.0, calories:180.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Mutton broth soup." },
  { food:"Gazpacho", cuisine:"Spanish", category:"soup", display_amount:"1 bowl", grams_per_display:250.0, protein_g:3.75, carbs_g:17.5, fat_g:10.0, calories:150.0, sugar_g:3.15, sodium_mg:0, fiber_g:1.4, notes:"Chilled tomato soup." },
  { food:"Lentil Soup", cuisine:"Vegan", category:"soup", display_amount:"1 bowl", grams_per_display:250.0, protein_g:10.0, carbs_g:25.0, fat_g:4.0, calories:180.0, sugar_g:4.5, sodium_mg:0, fiber_g:2.0, notes:"Thick lentil soup." },
  { food:"Caprese Salad", cuisine:"Italian", category:"salad", display_amount:"1 bowl", grams_per_display:150.0, protein_g:9.0, carbs_g:4.5, fat_g:12.0, calories:180.0, sugar_g:0.81, sodium_mg:0, fiber_g:0.36, notes:"Tomato, mozzarella, basil." },
  { food:"Caesar Salad", cuisine:"Salad", category:"salad", display_amount:"1 bowl", grams_per_display:180.0, protein_g:7.0, carbs_g:10.0, fat_g:12.0, calories:180.0, sugar_g:1.8, sodium_mg:0, fiber_g:0.8, notes:"Romaine with dressing and croutons." },
  { food:"Chicken Salad", cuisine:"Salad", category:"salad", display_amount:"1 bowl", grams_per_display:180.0, protein_g:20.0, carbs_g:8.0, fat_g:8.0, calories:180.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Chicken with mixed vegetables." },
  { food:"Fruit Salad", cuisine:"Salad", category:"salad", display_amount:"1 bowl", grams_per_display:150.0, protein_g:1.0, carbs_g:20.0, fat_g:0.5, calories:90.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Mixed seasonal fruits." },
  { food:"Garden Salad", cuisine:"Salad", category:"salad", display_amount:"1 bowl", grams_per_display:120.0, protein_g:2.0, carbs_g:8.0, fat_g:2.0, calories:70.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Mixed lettuce, tomato, cucumber." },
  { food:"Greek Salad", cuisine:"Salad", category:"salad", display_amount:"1 bowl", grams_per_display:180.0, protein_g:5.0, carbs_g:10.0, fat_g:12.0, calories:170.0, sugar_g:1.8, sodium_mg:0, fiber_g:0.8, notes:"With feta, olives, and vegetables." },
  { food:"Chickpea Salad", cuisine:"Vegan", category:"salad", display_amount:"1 bowl", grams_per_display:150.0, protein_g:7.0, carbs_g:20.0, fat_g:5.0, calories:160.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Chickpeas with vegetables." },
  { food:"Coleslaw", cuisine:"Western", category:"salad", display_amount:"1 bowl", grams_per_display:150.0, protein_g:3.0, carbs_g:21.0, fat_g:18.0, calories:270.0, sugar_g:3.78, sodium_mg:0, fiber_g:1.68, notes:"Cabbage slaw with dressing." },
  { food:"Mishti Doi", cuisine:"Bengali", category:"dessert", display_amount:"1 bowl", grams_per_display:100.0, protein_g:3.0, carbs_g:18.0, fat_g:4.0, calories:120.0, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Sweetened set yogurt." },
  { food:"Rasgulla", cuisine:"Bengali", category:"dessert", display_amount:"1 piece", grams_per_display:40.0, protein_g:2.0, carbs_g:8.0, fat_g:1.0, calories:49.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Syrup-soaked cheese ball." },
  { food:"Sandesh", cuisine:"Bengali", category:"dessert", display_amount:"1 piece", grams_per_display:30.0, protein_g:2.0, carbs_g:8.0, fat_g:2.0, calories:58.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Fresh milk-based sweet." },
  { food:"Vanilla Ice Cream", cuisine:"Dessert", category:"dessert", display_amount:"1 cup", grams_per_display:100.0, protein_g:3.5, carbs_g:23.0, fat_g:11.0, calories:207.0, sugar_g:4.14, sodium_mg:0, fiber_g:1.84, notes:"Average vanilla ice cream." },
  { food:"Basundi", cuisine:"Gujarati", category:"dessert", display_amount:"1 cup", grams_per_display:150.0, protein_g:5.0, carbs_g:30.0, fat_g:12.0, calories:248.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Sweetened reduced milk dessert." },
  { food:"Mohanthal", cuisine:"Gujarati", category:"dessert", display_amount:"1 piece", grams_per_display:30.0, protein_g:3.0, carbs_g:16.0, fat_g:8.0, calories:148.0, sugar_g:2.88, sodium_mg:0, fiber_g:1.28, notes:"Gram flour sweet fudge." },
  { food:"Shrikhand", cuisine:"Gujarati", category:"dessert", display_amount:"1 bowl", grams_per_display:100.0, protein_g:4.0, carbs_g:20.0, fat_g:9.0, calories:180.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Sweetened strained yogurt." },
  { food:"Tiramisu", cuisine:"Italian", category:"dessert", display_amount:"1 slice", grams_per_display:120.0, protein_g:6.0, carbs_g:30.0, fat_g:24.0, calories:360.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Average tiramisu slice." },
  { food:"Ukadiche Modak", cuisine:"Marathi", category:"dessert", display_amount:"1 piece", grams_per_display:40.0, protein_g:1.6, carbs_g:13.2, fat_g:2.4, calories:72.0, sugar_g:2.38, sodium_mg:0, fiber_g:1.06, notes:"Rice-flour sweet dumpling." },
  { food:"Gulab Jamun", cuisine:"North Indian", category:"dessert", display_amount:"1 piece", grams_per_display:35.0, protein_g:1.05, carbs_g:7.0, fat_g:2.1, calories:52.5, sugar_g:1.26, sodium_mg:0, fiber_g:0.56, notes:"Average gulab jamun." },
  { food:"Rabdi", cuisine:"North Indian", category:"dessert", display_amount:"1 cup", grams_per_display:200.0, protein_g:18.0, carbs_g:56.0, fat_g:36.0, calories:600.0, sugar_g:10.08, sodium_mg:0, fiber_g:4.48, notes:"Sweet milk rabdi." },
  { food:"Kesari Bath", cuisine:"South Indian", category:"dessert", display_amount:"1 cup", grams_per_display:180.0, protein_g:7.2, carbs_g:81.0, fat_g:21.6, calories:576.0, sugar_g:14.58, sodium_mg:0, fiber_g:6.48, notes:"Sweet semolina kesari." },
  { food:"Churros", cuisine:"Spanish", category:"dessert", display_amount:"3 pieces", grams_per_display:90.0, protein_g:4.5, carbs_g:45.0, fat_g:19.8, calories:378.0, sugar_g:8.1, sodium_mg:0, fiber_g:3.6, notes:"Fried dough pastry." },
  { food:"Black Coffee", cuisine:"Beverage", category:"beverage", display_amount:"1 cup", grams_per_display:240.0, protein_g:0.0, carbs_g:0.0, fat_g:0.0, calories:4.8, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Unsweetened brewed coffee." },
  { food:"Coconut Water", cuisine:"Beverage", category:"beverage", display_amount:"1 glass", grams_per_display:240.0, protein_g:1.68, carbs_g:8.88, fat_g:0.48, calories:45.6, sugar_g:1.6, sodium_mg:0, fiber_g:0.71, notes:"Natural coconut water." },
  { food:"Coke", cuisine:"Beverage", category:"beverage", display_amount:"1 can", grams_per_display:330.0, protein_g:0.0, carbs_g:35.0, fat_g:0.0, calories:140.0, sugar_g:6.3, sodium_mg:0, fiber_g:2.8, notes:"Regular cola soft drink." },
  { food:"Coke (330ml)", cuisine:"Beverage", category:"beverage", display_amount:"1 can", grams_per_display:330.0, protein_g:0.0, carbs_g:128.7, fat_g:0.0, calories:458.7, sugar_g:23.17, sodium_mg:0, fiber_g:10.3, notes:"Coca-Cola, average can." },
  { food:"Fanta", cuisine:"Beverage", category:"beverage", display_amount:"1 can", grams_per_display:330.0, protein_g:0.0, carbs_g:37.0, fat_g:0.0, calories:150.0, sugar_g:6.66, sodium_mg:0, fiber_g:2.96, notes:"Orange soda." },
  { food:"Fruit Juice (Average)", cuisine:"Beverage", category:"beverage", display_amount:"1 glass", grams_per_display:250.0, protein_g:0.75, carbs_g:27.5, fat_g:0.25, calories:115.0, sugar_g:4.95, sodium_mg:0, fiber_g:2.2, notes:"Average fruit juice, unsweetened/standard." },
  { food:"Lemon Juice", cuisine:"Beverage", category:"beverage", display_amount:"1 glass", grams_per_display:250.0, protein_g:1.0, carbs_g:17.25, fat_g:0.5, calories:55.0, sugar_g:3.1, sodium_mg:0, fiber_g:1.38, notes:"Diluted lemon juice, unsweetened." },
  { food:"Lemon Soda", cuisine:"Beverage", category:"beverage", display_amount:"1 glass", grams_per_display:250.0, protein_g:0.0, carbs_g:20.0, fat_g:0.0, calories:80.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Sweet lemon soda." },
  { food:"Maaza", cuisine:"Beverage", category:"beverage", display_amount:"1 bottle", grams_per_display:250.0, protein_g:0.0, carbs_g:33.0, fat_g:0.0, calories:140.0, sugar_g:5.94, sodium_mg:0, fiber_g:2.64, notes:"Mango drink." },
  { food:"Maaza (330ml)", cuisine:"Beverage", category:"beverage", display_amount:"1 can", grams_per_display:330.0, protein_g:0.0, carbs_g:141.9, fat_g:0.0, calories:561.0, sugar_g:25.54, sodium_mg:0, fiber_g:11.35, notes:"Mango drink average." },
  { food:"Mirinda", cuisine:"Beverage", category:"beverage", display_amount:"1 can", grams_per_display:330.0, protein_g:0.0, carbs_g:38.0, fat_g:0.0, calories:160.0, sugar_g:6.84, sodium_mg:0, fiber_g:3.04, notes:"Orange soft drink." },
  { food:"Mirinda (330ml)", cuisine:"Beverage", category:"beverage", display_amount:"1 can", grams_per_display:330.0, protein_g:0.0, carbs_g:128.7, fat_g:0.0, calories:495.0, sugar_g:23.17, sodium_mg:0, fiber_g:10.3, notes:"Orange drink average." },
  { food:"Monster Energy", cuisine:"Beverage", category:"beverage", display_amount:"1 can", grams_per_display:500.0, protein_g:0.0, carbs_g:54.0, fat_g:0.0, calories:210.0, sugar_g:9.72, sodium_mg:0, fiber_g:4.32, notes:"Energy drink, average." },
  { food:"Pepsi", cuisine:"Beverage", category:"beverage", display_amount:"1 can", grams_per_display:330.0, protein_g:0.0, carbs_g:36.0, fat_g:0.0, calories:150.0, sugar_g:6.48, sodium_mg:0, fiber_g:2.88, notes:"Regular cola soft drink." },
  { food:"Pepsi (330ml)", cuisine:"Beverage", category:"beverage", display_amount:"1 can", grams_per_display:330.0, protein_g:0.0, carbs_g:135.3, fat_g:0.0, calories:495.0, sugar_g:24.35, sodium_mg:0, fiber_g:10.82, notes:"Pepsi, average can." },
  { food:"Red Bull", cuisine:"Beverage", category:"beverage", display_amount:"1 can", grams_per_display:250.0, protein_g:0.0, carbs_g:27.0, fat_g:0.0, calories:110.0, sugar_g:4.86, sodium_mg:0, fiber_g:2.16, notes:"Energy drink, average." },
  { food:"Soda", cuisine:"Beverage", category:"beverage", display_amount:"1 can", grams_per_display:355.0, protein_g:0.0, carbs_g:37.63, fat_g:0.0, calories:149.1, sugar_g:6.77, sodium_mg:0, fiber_g:3.01, notes:"Sugar-sweetened soft drink." },
  { food:"Sprite", cuisine:"Beverage", category:"beverage", display_amount:"1 can", grams_per_display:330.0, protein_g:0.0, carbs_g:35.0, fat_g:0.0, calories:140.0, sugar_g:6.3, sodium_mg:0, fiber_g:2.8, notes:"Lemon-lime soda." },
  { food:"Tea (Masala Chai)", cuisine:"Beverage", category:"beverage", display_amount:"1 cup", grams_per_display:150.0, protein_g:3.0, carbs_g:12.0, fat_g:3.75, calories:90.0, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Masala chai, average." },
  { food:"Tea (Milk Tea)", cuisine:"Beverage", category:"beverage", display_amount:"1 cup", grams_per_display:150.0, protein_g:3.0, carbs_g:10.5, fat_g:3.0, calories:82.5, sugar_g:1.89, sodium_mg:0, fiber_g:0.84, notes:"Indian milk tea with moderate sugar." },
  { food:"Tea (Plain Black)", cuisine:"Beverage", category:"beverage", display_amount:"1 cup", grams_per_display:240.0, protein_g:0.0, carbs_g:0.0, fat_g:0.0, calories:4.8, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Unsweetened black tea." },
  { food:"Thums Up", cuisine:"Beverage", category:"beverage", display_amount:"1 can", grams_per_display:330.0, protein_g:0.0, carbs_g:35.0, fat_g:0.0, calories:150.0, sugar_g:6.3, sodium_mg:0, fiber_g:2.8, notes:"Cola soda." },
  { food:"Black Tea", cuisine:"Indian", category:"beverage", display_amount:"1 cup", grams_per_display:200.0, protein_g:0.0, carbs_g:0.5, fat_g:0.0, calories:2.0, sugar_g:0.09, sodium_mg:0, fiber_g:0.04, notes:"Unsweetened brewed tea." },
  { food:"Ginger Tea", cuisine:"Indian", category:"beverage", display_amount:"1 cup", grams_per_display:200.0, protein_g:1.2, carbs_g:5.5, fat_g:1.3, calories:35.0, sugar_g:0.99, sodium_mg:0, fiber_g:0.44, notes:"Tea with ginger, milk, and sugar." },
  { food:"Green Tea", cuisine:"Indian", category:"beverage", display_amount:"1 cup", grams_per_display:200.0, protein_g:0.0, carbs_g:0.5, fat_g:0.0, calories:2.0, sugar_g:0.09, sodium_mg:0, fiber_g:0.04, notes:"Unsweetened green tea." },
  { food:"Masala Tea", cuisine:"Indian", category:"beverage", display_amount:"1 cup", grams_per_display:200.0, protein_g:1.5, carbs_g:6.5, fat_g:1.5, calories:40.0, sugar_g:1.17, sodium_mg:0, fiber_g:0.52, notes:"Tea with milk, sugar, and spices." },
  { food:"Milk Tea (Chai)", cuisine:"Indian", category:"beverage", display_amount:"1 cup", grams_per_display:200.0, protein_g:2.0, carbs_g:8.0, fat_g:2.0, calories:55.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Standard sweet milk tea." },
  { food:"Sugarcane Juice", cuisine:"Indian", category:"beverage", display_amount:"1 glass", grams_per_display:250.0, protein_g:0.0, carbs_g:30.0, fat_g:0.0, calories:120.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Fresh sugarcane juice, average." },
  { food:"Cappuccino", cuisine:"Italian", category:"beverage", display_amount:"1 cup", grams_per_display:180.0, protein_g:4.0, carbs_g:10.0, fat_g:4.0, calories:90.0, sugar_g:1.8, sodium_mg:0, fiber_g:0.8, notes:"Espresso with steamed milk and foam." },
  { food:"Espresso", cuisine:"Italian", category:"beverage", display_amount:"1 shot", grams_per_display:30.0, protein_g:0.5, carbs_g:0.5, fat_g:0.0, calories:5.0, sugar_g:0.09, sodium_mg:0, fiber_g:0.04, notes:"Single espresso shot." },
  { food:"Latte", cuisine:"Italian", category:"beverage", display_amount:"1 cup", grams_per_display:240.0, protein_g:8.0, carbs_g:12.0, fat_g:7.0, calories:140.0, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Milk-heavy espresso drink." },
  { food:"Kokum Saar", cuisine:"Marathi", category:"beverage", display_amount:"1 cup", grams_per_display:240.0, protein_g:1.0, carbs_g:7.0, fat_g:0.5, calories:36.5, sugar_g:1.26, sodium_mg:0, fiber_g:0.56, notes:"Tart kokum soup." },
  { food:"Solkadhi", cuisine:"Marathi", category:"beverage", display_amount:"1 cup", grams_per_display:240.0, protein_g:1.0, carbs_g:6.0, fat_g:4.0, calories:64.0, sugar_g:1.08, sodium_mg:0, fiber_g:0.48, notes:"Kokum and coconut milk drink." },
  { food:"Lassi Salted", cuisine:"North Indian", category:"beverage", display_amount:"1 glass", grams_per_display:250.0, protein_g:4.0, carbs_g:10.0, fat_g:4.0, calories:92.0, sugar_g:1.8, sodium_mg:0, fiber_g:0.8, notes:"Salted yogurt drink." },
  { food:"Lassi Sweet", cuisine:"North Indian", category:"beverage", display_amount:"1 glass", grams_per_display:250.0, protein_g:7.5, carbs_g:37.5, fat_g:7.5, calories:225.0, sugar_g:6.75, sodium_mg:0, fiber_g:3.0, notes:"Sweet yogurt drink." },
  { food:"Masala Chai", cuisine:"North Indian", category:"beverage", display_amount:"1 cup", grams_per_display:150.0, protein_g:1.0, carbs_g:10.0, fat_g:2.0, calories:62.0, sugar_g:1.8, sodium_mg:0, fiber_g:0.8, notes:"Tea with milk and sugar." },
  { food:"Filter Coffee", cuisine:"South Indian", category:"beverage", display_amount:"1 cup", grams_per_display:150.0, protein_g:2.25, carbs_g:12.0, fat_g:3.0, calories:82.5, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Milk coffee with sugar." },
  { food:"Almond Milk (Unsweetened)", cuisine:"Vegan", category:"beverage", display_amount:"1 cup", grams_per_display:240.0, protein_g:0.96, carbs_g:3.6, fat_g:6.0, calories:72.0, sugar_g:0.65, sodium_mg:0, fiber_g:0.29, notes:"Unsweetened almond milk." },
  { food:"Coconut Milk (Beverage)", cuisine:"Vegan", category:"beverage", display_amount:"1 cup", grams_per_display:240.0, protein_g:2.4, carbs_g:14.4, fat_g:12.0, calories:216.0, sugar_g:2.59, sodium_mg:0, fiber_g:1.15, notes:"Carton coconut milk beverage." },
  { food:"Oat Milk", cuisine:"Vegan", category:"beverage", display_amount:"1 cup", grams_per_display:240.0, protein_g:7.2, carbs_g:38.4, fat_g:12.0, calories:288.0, sugar_g:6.91, sodium_mg:0, fiber_g:3.07, notes:"Oat milk, unsweetened/standard." },
  { food:"Soy Milk", cuisine:"Vegan", category:"beverage", display_amount:"1 cup", grams_per_display:240.0, protein_g:7.0, carbs_g:4.0, fat_g:4.0, calories:80.0, sugar_g:0.72, sodium_mg:0, fiber_g:0.32, notes:"Unsweetened soy milk." },
  { food:"Cold Coffee", cuisine:"Western", category:"beverage", display_amount:"1 glass", grams_per_display:250.0, protein_g:4.0, carbs_g:18.0, fat_g:6.0, calories:140.0, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Sweetened milk coffee, chilled." },
  { food:"Hot Chocolate", cuisine:"Western", category:"beverage", display_amount:"1 cup", grams_per_display:240.0, protein_g:4.0, carbs_g:25.0, fat_g:6.0, calories:170.0, sugar_g:4.5, sodium_mg:0, fiber_g:2.0, notes:"Sweet cocoa drink." },
  { food:"Iced Tea", cuisine:"Western", category:"beverage", display_amount:"1 glass", grams_per_display:250.0, protein_g:0.0, carbs_g:20.0, fat_g:0.0, calories:90.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Sweetened iced tea." },
  { food:"Milk (Whole)", cuisine:"Western", category:"beverage", display_amount:"1 cup", grams_per_display:244.0, protein_g:7.81, carbs_g:11.71, fat_g:8.05, calories:148.8, sugar_g:2.11, sodium_mg:0, fiber_g:0.94, notes:"Whole cow milk." },
  { food:"Mocha", cuisine:"Western", category:"beverage", display_amount:"1 cup", grams_per_display:240.0, protein_g:5.0, carbs_g:25.0, fat_g:8.0, calories:180.0, sugar_g:4.5, sodium_mg:0, fiber_g:2.0, notes:"Chocolate coffee drink." },
  { food:"Anjeer (Dried Fig)", cuisine:"Fruit", category:"fruit", display_amount:"2 pieces", grams_per_display:40.0, protein_g:1.32, carbs_g:25.56, fat_g:0.36, calories:99.6, sugar_g:4.6, sodium_mg:0, fiber_g:2.04, notes:"Dried fig, common dry fruit." },
  { food:"Apple", cuisine:"Fruit", category:"fruit", display_amount:"1 medium", grams_per_display:182.0, protein_g:0.55, carbs_g:25.12, fat_g:0.36, calories:94.6, sugar_g:4.52, sodium_mg:0, fiber_g:2.01, notes:"Raw apple." },
  { food:"Avocado", cuisine:"Fruit", category:"fruit", display_amount:"1 medium", grams_per_display:150.0, protein_g:3.0, carbs_g:13.0, fat_g:21.0, calories:240.0, sugar_g:2.34, sodium_mg:0, fiber_g:1.04, notes:"Whole avocado pulp." },
  { food:"Banana", cuisine:"Fruit", category:"fruit", display_amount:"1 medium", grams_per_display:118.0, protein_g:1.3, carbs_g:26.9, fat_g:0.35, calories:105.0, sugar_g:4.84, sodium_mg:0, fiber_g:2.15, notes:"Raw banana." },
  { food:"Blackberries", cuisine:"Fruit", category:"fruit", display_amount:"1 cup", grams_per_display:144.0, protein_g:2.88, carbs_g:19.87, fat_g:1.01, calories:89.28, sugar_g:3.58, sodium_mg:0, fiber_g:1.59, notes:"Raw blackberries." },
  { food:"Blueberries", cuisine:"Fruit", category:"fruit", display_amount:"1 cup", grams_per_display:148.0, protein_g:1.63, carbs_g:21.76, fat_g:0.74, calories:124.32, sugar_g:3.92, sodium_mg:0, fiber_g:1.74, notes:"Raw blueberries." },
  { food:"Dates", cuisine:"Fruit", category:"fruit", display_amount:"2 pieces", grams_per_display:24.0, protein_g:0.6, carbs_g:18.0, fat_g:0.1, calories:66.48, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Date fruit, average." },
  { food:"Grapes", cuisine:"Fruit", category:"fruit", display_amount:"1 cup", grams_per_display:151.0, protein_g:1.06, carbs_g:27.33, fat_g:0.3, calories:104.2, sugar_g:4.92, sodium_mg:0, fiber_g:2.19, notes:"Fresh grapes." },
  { food:"Guava", cuisine:"Fruit", category:"fruit", display_amount:"1 medium", grams_per_display:100.0, protein_g:2.6, carbs_g:14.3, fat_g:1.0, calories:68.0, sugar_g:2.57, sodium_mg:0, fiber_g:1.14, notes:"Raw guava." },
  { food:"Lychee", cuisine:"Fruit", category:"fruit", display_amount:"1 cup", grams_per_display:190.0, protein_g:1.6, carbs_g:29.0, fat_g:0.8, calories:125.0, sugar_g:5.22, sodium_mg:0, fiber_g:2.32, notes:"Fresh lychee." },
  { food:"Mango", cuisine:"Fruit", category:"fruit", display_amount:"1 medium", grams_per_display:200.0, protein_g:1.6, carbs_g:30.0, fat_g:0.8, calories:120.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Raw mango flesh average." },
  { food:"Mulberries", cuisine:"Fruit", category:"fruit", display_amount:"1 cup", grams_per_display:140.0, protein_g:2.8, carbs_g:23.8, fat_g:0.7, calories:98.0, sugar_g:4.28, sodium_mg:0, fiber_g:1.9, notes:"Raw mulberries, average." },
  { food:"Muskmelon", cuisine:"Fruit", category:"fruit", display_amount:"1 cup", grams_per_display:160.0, protein_g:1.3, carbs_g:14.0, fat_g:0.3, calories:55.0, sugar_g:2.52, sodium_mg:0, fiber_g:1.12, notes:"Ripe muskmelon." },
  { food:"Orange", cuisine:"Fruit", category:"fruit", display_amount:"1 medium", grams_per_display:131.0, protein_g:1.18, carbs_g:15.46, fat_g:0.13, calories:61.6, sugar_g:2.78, sodium_mg:0, fiber_g:1.24, notes:"Raw orange." },
  { food:"Papaya", cuisine:"Fruit", category:"fruit", display_amount:"1 cup", grams_per_display:145.0, protein_g:0.72, carbs_g:15.95, fat_g:0.43, calories:62.4, sugar_g:2.87, sodium_mg:0, fiber_g:1.28, notes:"Raw papaya." },
  { food:"Pineapple", cuisine:"Fruit", category:"fruit", display_amount:"1 cup", grams_per_display:165.0, protein_g:0.82, carbs_g:21.61, fat_g:0.17, calories:82.5, sugar_g:3.89, sodium_mg:0, fiber_g:1.73, notes:"Fresh pineapple." },
  { food:"Pomegranate", cuisine:"Fruit", category:"fruit", display_amount:"1 cup", grams_per_display:174.0, protein_g:2.96, carbs_g:32.54, fat_g:2.09, calories:144.4, sugar_g:5.86, sodium_mg:0, fiber_g:2.6, notes:"Arils only." },
  { food:"Raspberries", cuisine:"Fruit", category:"fruit", display_amount:"1 cup", grams_per_display:123.0, protein_g:1.84, carbs_g:18.08, fat_g:0.86, calories:78.72, sugar_g:3.25, sodium_mg:0, fiber_g:1.45, notes:"Raw raspberries." },
  { food:"Strawberries", cuisine:"Fruit", category:"fruit", display_amount:"1 cup", grams_per_display:152.0, protein_g:1.0, carbs_g:12.0, fat_g:0.5, calories:49.0, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Fresh strawberries." },
  { food:"Strawberry", cuisine:"Fruit", category:"fruit", display_amount:"1 cup", grams_per_display:152.0, protein_g:1.52, carbs_g:17.48, fat_g:0.76, calories:76.0, sugar_g:3.15, sodium_mg:0, fiber_g:1.4, notes:"Raw strawberries." },
  { food:"Watermelon", cuisine:"Fruit", category:"fruit", display_amount:"1 cup", grams_per_display:152.0, protein_g:0.91, carbs_g:11.55, fat_g:0.3, calories:45.6, sugar_g:2.08, sodium_mg:0, fiber_g:0.92, notes:"Fresh watermelon." },
  { food:"Brinjal Curry", cuisine:"South Indian", category:"vegetable", display_amount:"1 cup", grams_per_display:200.0, protein_g:5.0, carbs_g:20.0, fat_g:16.0, calories:240.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Brinjal curry/baingan curry." },
  { food:"Beetroot", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:136.0, protein_g:2.18, carbs_g:13.6, fat_g:0.27, calories:58.5, sugar_g:2.45, sodium_mg:0, fiber_g:1.09, notes:"Cooked beetroot." },
  { food:"Bell Pepper", cuisine:"Vegetable", category:"vegetable", display_amount:"1 medium", grams_per_display:119.0, protein_g:1.19, carbs_g:7.14, fat_g:0.36, calories:36.9, sugar_g:1.29, sodium_mg:0, fiber_g:0.57, notes:"Raw bell pepper." },
  { food:"Bitter Gourd", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:100.0, protein_g:1.0, carbs_g:4.0, fat_g:0.2, calories:20.0, sugar_g:0.72, sodium_mg:0, fiber_g:0.32, notes:"Raw bitter gourd." },
  { food:"Bottle Gourd", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:100.0, protein_g:0.8, carbs_g:3.5, fat_g:0.1, calories:16.0, sugar_g:0.63, sodium_mg:0, fiber_g:0.28, notes:"Raw bottle gourd." },
  { food:"Brinjal", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:99.0, protein_g:1.0, carbs_g:8.0, fat_g:0.2, calories:35.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Raw brinjal/eggplant." },
  { food:"Broccoli", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:91.0, protein_g:2.55, carbs_g:6.37, fat_g:0.36, calories:30.9, sugar_g:1.15, sodium_mg:0, fiber_g:0.51, notes:"Raw broccoli." },
  { food:"Cabbage", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:89.0, protein_g:1.16, carbs_g:5.16, fat_g:0.09, calories:22.2, sugar_g:0.93, sodium_mg:0, fiber_g:0.41, notes:"Raw cabbage." },
  { food:"Capsicum", cuisine:"Vegetable", category:"vegetable", display_amount:"1 medium", grams_per_display:120.0, protein_g:1.3, carbs_g:7.0, fat_g:0.3, calories:31.0, sugar_g:1.26, sodium_mg:0, fiber_g:0.56, notes:"Raw bell pepper." },
  { food:"Carrot", cuisine:"Vegetable", category:"vegetable", display_amount:"1 medium", grams_per_display:61.0, protein_g:0.55, carbs_g:5.86, fat_g:0.12, calories:25.0, sugar_g:1.05, sodium_mg:0, fiber_g:0.47, notes:"Raw carrot." },
  { food:"Cauliflower", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:100.0, protein_g:1.9, carbs_g:5.0, fat_g:0.3, calories:25.0, sugar_g:0.9, sodium_mg:0, fiber_g:0.4, notes:"Raw cauliflower." },
  { food:"Corn", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:164.0, protein_g:5.58, carbs_g:31.16, fat_g:2.46, calories:157.4, sugar_g:5.61, sodium_mg:0, fiber_g:2.49, notes:"Cooked sweet corn." },
  { food:"Cucumber", cuisine:"Vegetable", category:"vegetable", display_amount:"1 medium", grams_per_display:201.0, protein_g:1.41, carbs_g:7.24, fat_g:0.2, calories:30.1, sugar_g:1.3, sodium_mg:0, fiber_g:0.58, notes:"Raw cucumber." },
  { food:"Drumstick", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:100.0, protein_g:2.0, carbs_g:8.0, fat_g:0.3, calories:40.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Drumstick pod, cooked style." },
  { food:"French Beans", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:100.0, protein_g:1.8, carbs_g:7.0, fat_g:0.2, calories:35.0, sugar_g:1.26, sodium_mg:0, fiber_g:0.56, notes:"Raw green beans." },
  { food:"Green Beans", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:125.0, protein_g:2.25, carbs_g:8.75, fat_g:0.12, calories:38.8, sugar_g:1.57, sodium_mg:0, fiber_g:0.7, notes:"Cooked green beans." },
  { food:"Green Peas", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:160.0, protein_g:8.64, carbs_g:22.4, fat_g:0.64, calories:134.4, sugar_g:4.03, sodium_mg:0, fiber_g:1.79, notes:"Cooked green peas." },
  { food:"Mushroom", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:70.0, protein_g:2.17, carbs_g:2.31, fat_g:0.21, calories:15.4, sugar_g:0.42, sodium_mg:0, fiber_g:0.18, notes:"Raw mushrooms." },
  { food:"Okra", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:100.0, protein_g:1.9, carbs_g:7.5, fat_g:0.2, calories:33.0, sugar_g:1.35, sodium_mg:0, fiber_g:0.6, notes:"Cooked okra." },
  { food:"Onion", cuisine:"Vegetable", category:"vegetable", display_amount:"1 medium", grams_per_display:110.0, protein_g:1.21, carbs_g:10.23, fat_g:0.11, calories:44.0, sugar_g:1.84, sodium_mg:0, fiber_g:0.82, notes:"Raw onion." },
  { food:"Potato", cuisine:"Vegetable", category:"vegetable", display_amount:"1 medium", grams_per_display:173.0, protein_g:3.29, carbs_g:34.77, fat_g:0.17, calories:148.8, sugar_g:6.26, sodium_mg:0, fiber_g:2.78, notes:"Boiled potato with skin." },
  { food:"Ridge Gourd", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:100.0, protein_g:1.0, carbs_g:4.5, fat_g:0.2, calories:20.0, sugar_g:0.81, sodium_mg:0, fiber_g:0.36, notes:"Raw ridge gourd." },
  { food:"Spinach", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:30.0, protein_g:0.87, carbs_g:1.08, fat_g:0.12, calories:6.9, sugar_g:0.19, sodium_mg:0, fiber_g:0.09, notes:"Raw spinach." },
  { food:"Sweet Corn", cuisine:"Vegetable", category:"vegetable", display_amount:"1 cup", grams_per_display:150.0, protein_g:5.0, carbs_g:31.0, fat_g:2.0, calories:160.0, sugar_g:5.58, sodium_mg:0, fiber_g:2.48, notes:"Cooked sweet corn kernels." },
  { food:"Sweet Potato", cuisine:"Vegetable", category:"vegetable", display_amount:"1 medium", grams_per_display:130.0, protein_g:2.08, carbs_g:26.13, fat_g:0.13, calories:111.8, sugar_g:4.7, sodium_mg:0, fiber_g:2.09, notes:"Boiled sweet potato." },
  { food:"Tomato", cuisine:"Vegetable", category:"vegetable", display_amount:"1 medium", grams_per_display:123.0, protein_g:1.11, carbs_g:4.8, fat_g:0.25, calories:22.1, sugar_g:0.86, sodium_mg:0, fiber_g:0.38, notes:"Raw tomato." },
  { food:"Peri Peri Chicken", cuisine:"African", category:"protein", display_amount:"1 serving", grams_per_display:200.0, protein_g:30.0, carbs_g:5.0, fat_g:12.0, calories:250.0, sugar_g:0.9, sodium_mg:0, fiber_g:0.4, notes:"Spicy grilled chicken." },
  { food:"Suya", cuisine:"African", category:"protein", display_amount:"1 skewer", grams_per_display:120.0, protein_g:20.0, carbs_g:4.0, fat_g:14.0, calories:230.0, sugar_g:0.72, sodium_mg:0, fiber_g:0.32, notes:"Spiced grilled meat skewer." },
  { food:"Beef (Lean)", cuisine:"Ingredient", category:"protein", display_amount:"100 g", grams_per_display:100.0, protein_g:26.0, carbs_g:0.0, fat_g:15.0, calories:250.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Cooked lean beef." },
  { food:"Chicken Breast", cuisine:"Ingredient", category:"protein", display_amount:"100 g", grams_per_display:100.0, protein_g:31.0, carbs_g:0.0, fat_g:3.6, calories:165.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Cooked, skinless." },
  { food:"Chicken Thigh", cuisine:"Ingredient", category:"protein", display_amount:"100 g", grams_per_display:100.0, protein_g:26.0, carbs_g:0.0, fat_g:10.9, calories:209.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Cooked, skinless." },
  { food:"Mutton", cuisine:"Ingredient", category:"protein", display_amount:"100 g", grams_per_display:100.0, protein_g:25.0, carbs_g:0.0, fat_g:20.0, calories:280.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Cooked mutton/lamb average." },
  { food:"Paneer", cuisine:"Ingredient", category:"protein", display_amount:"100 g", grams_per_display:100.0, protein_g:18.0, carbs_g:2.0, fat_g:20.0, calories:265.0, sugar_g:0.36, sodium_mg:0, fiber_g:0.16, notes:"Fresh Indian cottage cheese." },
  { food:"Pork (Lean)", cuisine:"Ingredient", category:"protein", display_amount:"100 g", grams_per_display:100.0, protein_g:27.0, carbs_g:0.0, fat_g:14.0, calories:242.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Cooked lean pork." },
  { food:"Prawn", cuisine:"Ingredient", category:"protein", display_amount:"100 g", grams_per_display:100.0, protein_g:24.0, carbs_g:0.2, fat_g:0.3, calories:99.0, sugar_g:0.04, sodium_mg:0, fiber_g:0.02, notes:"Cooked shrimp/prawn." },
  { food:"Salmon", cuisine:"Ingredient", category:"protein", display_amount:"100 g", grams_per_display:100.0, protein_g:20.4, carbs_g:0.0, fat_g:13.4, calories:208.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Cooked salmon." },
  { food:"Sardine", cuisine:"Ingredient", category:"protein", display_amount:"100 g", grams_per_display:100.0, protein_g:24.6, carbs_g:0.0, fat_g:10.5, calories:208.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Cooked sardines." },
  { food:"Tofu", cuisine:"Ingredient", category:"protein", display_amount:"100 g", grams_per_display:100.0, protein_g:8.0, carbs_g:2.0, fat_g:4.8, calories:76.0, sugar_g:0.36, sodium_mg:0, fiber_g:0.16, notes:"Firm tofu." },
  { food:"Tuna", cuisine:"Ingredient", category:"protein", display_amount:"100 g", grams_per_display:100.0, protein_g:29.0, carbs_g:0.0, fat_g:1.0, calories:132.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Canned in water, drained." },
  { food:"Teriyaki Chicken", cuisine:"Japanese", category:"protein", display_amount:"1 serving", grams_per_display:180.0, protein_g:24.0, carbs_g:20.0, fat_g:8.0, calories:260.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Chicken with teriyaki glaze." },
  { food:"Bulgogi", cuisine:"Korean", category:"protein", display_amount:"1 serving", grams_per_display:180.0, protein_g:22.0, carbs_g:12.0, fat_g:10.0, calories:240.0, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Marinated beef." },
  { food:"Tempeh", cuisine:"Vegan", category:"protein", display_amount:"100 g", grams_per_display:100.0, protein_g:19.0, carbs_g:9.0, fat_g:11.0, calories:190.0, sugar_g:1.62, sodium_mg:0, fiber_g:0.72, notes:"Fermented soy cake." },
  { food:"Vegan Burger Patty", cuisine:"Vegan", category:"protein", display_amount:"1 patty", grams_per_display:100.0, protein_g:12.0, carbs_g:18.0, fat_g:7.0, calories:170.0, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Plant-based burger patty." },
  { food:"Boiled Egg", cuisine:"Western", category:"protein", display_amount:"1 large", grams_per_display:50.0, protein_g:6.3, carbs_g:0.55, fat_g:4.75, calories:71.5, sugar_g:0.1, sodium_mg:0, fiber_g:0.04, notes:"Boiled whole egg." },
  { food:"Egg", cuisine:"Western", category:"protein", display_amount:"1 large", grams_per_display:50.0, protein_g:6.3, carbs_g:0.55, fat_g:4.75, calories:71.5, sugar_g:0.1, sodium_mg:0, fiber_g:0.04, notes:"Whole chicken egg." },
  { food:"Ham", cuisine:"Western", category:"protein", display_amount:"2 slices", grams_per_display:60.0, protein_g:10.8, carbs_g:0.9, fat_g:4.8, calories:87.0, sugar_g:0.16, sodium_mg:0, fiber_g:0.07, notes:"Lean ham slices." },
  { food:"Sausage", cuisine:"Western", category:"protein", display_amount:"1 piece", grams_per_display:50.0, protein_g:7.0, carbs_g:1.0, fat_g:15.0, calories:165.0, sugar_g:0.18, sodium_mg:0, fiber_g:0.08, notes:"Pork sausage." },
  { food:"Scrambled Eggs", cuisine:"Western", category:"protein", display_amount:"2 eggs", grams_per_display:100.0, protein_g:11.5, carbs_g:2.0, fat_g:13.0, calories:170.0, sugar_g:0.36, sodium_mg:0, fiber_g:0.16, notes:"With a little milk/butter." },
  { food:"Cream Cheese", cuisine:"Dairy", category:"dairy", display_amount:"1 tbsp", grams_per_display:15.0, protein_g:1.0, carbs_g:1.0, fat_g:5.0, calories:50.0, sugar_g:0.18, sodium_mg:0, fiber_g:0.08, notes:"Cream cheese spread." },
  { food:"Mozzarella Cheese", cuisine:"Dairy", category:"dairy", display_amount:"1 slice", grams_per_display:20.0, protein_g:5.0, carbs_g:1.0, fat_g:6.0, calories:80.0, sugar_g:0.18, sodium_mg:0, fiber_g:0.08, notes:"Mozzarella slice." },
  { food:"Processed Cheese Slice", cuisine:"Dairy", category:"dairy", display_amount:"1 slice", grams_per_display:20.0, protein_g:4.0, carbs_g:1.0, fat_g:5.0, calories:70.0, sugar_g:0.18, sodium_mg:0, fiber_g:0.08, notes:"Processed slice." },
  { food:"Curd", cuisine:"Indian", category:"dairy", display_amount:"1 cup", grams_per_display:245.0, protein_g:8.57, carbs_g:11.52, fat_g:8.09, calories:149.45, sugar_g:2.07, sodium_mg:0, fiber_g:0.92, notes:"Plain curd/yogurt." },
  { food:"Cheddar Cheese", cuisine:"Western", category:"dairy", display_amount:"1 slice", grams_per_display:28.0, protein_g:7.0, carbs_g:0.36, fat_g:9.24, calories:112.8, sugar_g:0.06, sodium_mg:0, fiber_g:0.03, notes:"Cheddar cheese slice." },
  { food:"Plain Yogurt", cuisine:"Western", category:"dairy", display_amount:"1 cup", grams_per_display:245.0, protein_g:8.57, carbs_g:11.52, fat_g:8.09, calories:149.4, sugar_g:2.07, sodium_mg:0, fiber_g:0.92, notes:"Plain yogurt." },
  { food:"Canola Oil", cuisine:"Ingredient", category:"fat", display_amount:"1 tbsp", grams_per_display:14.0, protein_g:0.0, carbs_g:0.0, fat_g:14.0, calories:120.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Pure oil." },
  { food:"Coconut", cuisine:"Ingredient", category:"fat", display_amount:"1 cup", grams_per_display:80.0, protein_g:2.64, carbs_g:12.16, fat_g:26.8, calories:283.2, sugar_g:2.19, sodium_mg:0, fiber_g:0.97, notes:"Fresh coconut flesh." },
  { food:"Coconut Oil", cuisine:"Ingredient", category:"fat", display_amount:"1 tbsp", grams_per_display:14.0, protein_g:0.0, carbs_g:0.0, fat_g:14.0, calories:120.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Pure oil." },
  { food:"Cooking Oil", cuisine:"Ingredient", category:"fat", display_amount:"1 tbsp", grams_per_display:14.0, protein_g:0.0, carbs_g:0.0, fat_g:14.0, calories:126.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Any vegetable oil, pure fat basis." },
  { food:"Ghee", cuisine:"Ingredient", category:"fat", display_amount:"1 tsp", grams_per_display:5.0, protein_g:0.0, carbs_g:0.0, fat_g:5.0, calories:45.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Clarified butter." },
  { food:"Groundnut Oil", cuisine:"Ingredient", category:"fat", display_amount:"1 tbsp", grams_per_display:14.0, protein_g:0.0, carbs_g:0.0, fat_g:14.0, calories:120.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Pure oil." },
  { food:"Mustard Oil", cuisine:"Ingredient", category:"fat", display_amount:"1 tbsp", grams_per_display:14.0, protein_g:0.0, carbs_g:0.0, fat_g:14.0, calories:120.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Pure oil." },
  { food:"Olive Oil", cuisine:"Ingredient", category:"fat", display_amount:"1 tbsp", grams_per_display:14.0, protein_g:0.0, carbs_g:0.0, fat_g:14.0, calories:119.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Pure oil." },
  { food:"Peanut Butter", cuisine:"Ingredient", category:"fat", display_amount:"1 tbsp", grams_per_display:16.0, protein_g:4.0, carbs_g:3.2, fat_g:8.0, calories:94.1, sugar_g:0.58, sodium_mg:0, fiber_g:0.26, notes:"Smooth peanut butter." },
  { food:"Peanut Oil", cuisine:"Ingredient", category:"fat", display_amount:"1 tbsp", grams_per_display:14.0, protein_g:0.0, carbs_g:0.0, fat_g:14.0, calories:123.76, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Peanut oil." },
  { food:"Rice Bran Oil", cuisine:"Ingredient", category:"fat", display_amount:"1 tbsp", grams_per_display:14.0, protein_g:0.0, carbs_g:0.0, fat_g:14.0, calories:120.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Pure oil." },
  { food:"Sesame Oil", cuisine:"Ingredient", category:"fat", display_amount:"1 tbsp", grams_per_display:14.0, protein_g:0.0, carbs_g:0.0, fat_g:14.0, calories:120.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Pure oil." },
  { food:"Sunflower Oil", cuisine:"Ingredient", category:"fat", display_amount:"1 tbsp", grams_per_display:14.0, protein_g:0.0, carbs_g:0.0, fat_g:14.0, calories:120.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Pure oil." },
  { food:"Vegan Butter", cuisine:"Vegan", category:"fat", display_amount:"1 tbsp", grams_per_display:14.0, protein_g:0.0, carbs_g:0.0, fat_g:1.54, calories:14.0, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Plant-based butter spread." },
  { food:"Bread Bun", cuisine:"Bakery", category:"bakery", display_amount:"1 piece", grams_per_display:50.0, protein_g:4.0, carbs_g:25.0, fat_g:1.5, calories:135.0, sugar_g:4.5, sodium_mg:0, fiber_g:2.0, notes:"Plain bun, average." },
  { food:"Butter Toast", cuisine:"Bakery", category:"bakery", display_amount:"2 slices", grams_per_display:70.0, protein_g:5.0, carbs_g:30.0, fat_g:7.0, calories:220.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Toast with butter." },
  { food:"Egg Puff", cuisine:"Bakery", category:"bakery", display_amount:"1 piece", grams_per_display:80.0, protein_g:7.0, carbs_g:19.0, fat_g:14.0, calories:250.0, sugar_g:3.42, sodium_mg:0, fiber_g:1.52, notes:"Egg puff pastry." },
  { food:"Khara Bun", cuisine:"Bakery", category:"bakery", display_amount:"1 piece", grams_per_display:60.0, protein_g:5.0, carbs_g:30.0, fat_g:4.0, calories:180.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Spiced savory bun." },
  { food:"Muffin", cuisine:"Bakery", category:"bakery", display_amount:"1 piece", grams_per_display:90.0, protein_g:4.0, carbs_g:35.0, fat_g:12.0, calories:280.0, sugar_g:6.3, sodium_mg:0, fiber_g:2.8, notes:"Sweet bakery muffin." },
  { food:"Mushroom Puff", cuisine:"Bakery", category:"bakery", display_amount:"1 piece", grams_per_display:85.0, protein_g:6.0, carbs_g:21.0, fat_g:13.0, calories:240.0, sugar_g:3.78, sodium_mg:0, fiber_g:1.68, notes:"Mushroom puff pastry." },
  { food:"Paneer Puff", cuisine:"Bakery", category:"bakery", display_amount:"1 piece", grams_per_display:90.0, protein_g:8.0, carbs_g:22.0, fat_g:15.0, calories:270.0, sugar_g:3.96, sodium_mg:0, fiber_g:1.76, notes:"Paneer puff pastry." },
  { food:"Pav", cuisine:"Bakery", category:"bakery", display_amount:"1 piece", grams_per_display:50.0, protein_g:4.0, carbs_g:26.0, fat_g:3.0, calories:150.0, sugar_g:4.68, sodium_mg:0, fiber_g:2.08, notes:"Soft pav bun." },
  { food:"Plain Bun", cuisine:"Bakery", category:"bakery", display_amount:"1 piece", grams_per_display:50.0, protein_g:4.0, carbs_g:25.0, fat_g:3.0, calories:150.0, sugar_g:4.5, sodium_mg:0, fiber_g:2.0, notes:"Soft white bun." },
  { food:"Toast", cuisine:"Bakery", category:"bakery", display_amount:"2 slices", grams_per_display:60.0, protein_g:5.0, carbs_g:30.0, fat_g:4.0, calories:180.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Toast bread, plain." },
  { food:"Veg Puff", cuisine:"Bakery", category:"bakery", display_amount:"1 piece", grams_per_display:75.0, protein_g:5.0, carbs_g:20.0, fat_g:12.0, calories:220.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Vegetable puff pastry." },
  { food:"Couscous", cuisine:"African", category:"staple", display_amount:"1 cup", grams_per_display:157.0, protein_g:9.42, carbs_g:56.52, fat_g:0.47, calories:276.32, sugar_g:10.17, sodium_mg:0, fiber_g:4.52, notes:"Cooked couscous." },
  { food:"Fufu", cuisine:"African", category:"staple", display_amount:"1 cup", grams_per_display:200.0, protein_g:3.0, carbs_g:96.0, fat_g:1.0, calories:440.0, sugar_g:17.28, sodium_mg:0, fiber_g:7.68, notes:"Fufu, average cassava/yam-based." },
  { food:"Injera", cuisine:"African", category:"staple", display_amount:"1 piece", grams_per_display:100.0, protein_g:5.0, carbs_g:25.0, fat_g:1.0, calories:130.0, sugar_g:4.5, sodium_mg:0, fiber_g:2.0, notes:"Fermented flatbread." },
  { food:"Pap / Ugali", cuisine:"African", category:"staple", display_amount:"1 cup", grams_per_display:200.0, protein_g:3.0, carbs_g:40.0, fat_g:1.0, calories:190.0, sugar_g:7.2, sodium_mg:0, fiber_g:3.2, notes:"Maize meal staple." },
  { food:"Ugali", cuisine:"African", category:"staple", display_amount:"1 serving", grams_per_display:180.0, protein_g:7.2, carbs_g:73.8, fat_g:1.8, calories:360.0, sugar_g:13.28, sodium_mg:0, fiber_g:5.9, notes:"Maize ugali, average." },
  { food:"Luchi", cuisine:"Bengali", category:"staple", display_amount:"1 piece", grams_per_display:25.0, protein_g:3.0, carbs_g:12.0, fat_g:6.0, calories:114.0, sugar_g:2.16, sodium_mg:0, fiber_g:0.96, notes:"Deep-fried white flour bread." },
  { food:"Thepla", cuisine:"Gujarati", category:"staple", display_amount:"1 piece", grams_per_display:40.0, protein_g:2.4, carbs_g:11.2, fat_g:4.0, calories:84.0, sugar_g:2.02, sodium_mg:0, fiber_g:0.9, notes:"Methi thepla, lightly oiled." },
  { food:"Jolada Rotti", cuisine:"Karnataka", category:"staple", display_amount:"1 piece", grams_per_display:50.0, protein_g:2.5, carbs_g:17.0, fat_g:0.75, calories:80.0, sugar_g:3.06, sodium_mg:0, fiber_g:1.36, notes:"Jowar rotti, average." },
  { food:"Thalipeeth", cuisine:"Marathi", category:"staple", display_amount:"1 piece", grams_per_display:70.0, protein_g:4.2, carbs_g:21.0, fat_g:5.6, calories:133.0, sugar_g:3.78, sodium_mg:0, fiber_g:1.68, notes:"Multigrain flatbread." },
  { food:"Sticky Rice", cuisine:"North Eastern", category:"staple", display_amount:"1 cup", grams_per_display:180.0, protein_g:4.86, carbs_g:50.4, fat_g:0.54, calories:234.0, sugar_g:9.07, sodium_mg:0, fiber_g:4.03, notes:"Cooked sticky rice." },
  { food:"Aloo Paratha", cuisine:"North Indian", category:"staple", display_amount:"1 piece", grams_per_display:120.0, protein_g:6.6, carbs_g:34.8, fat_g:14.4, calories:288.0, sugar_g:6.26, sodium_mg:0, fiber_g:2.78, notes:"Stuffed potato paratha." },
  { food:"Bhature", cuisine:"North Indian", category:"staple", display_amount:"1 piece", grams_per_display:80.0, protein_g:6.0, carbs_g:30.0, fat_g:10.0, calories:234.0, sugar_g:5.4, sodium_mg:0, fiber_g:2.4, notes:"Deep-fried leavened bread." },
  { food:"Chapati", cuisine:"North Indian", category:"staple", display_amount:"1 piece", grams_per_display:43.0, protein_g:3.4, carbs_g:8.51, fat_g:1.42, calories:58.5, sugar_g:1.53, sodium_mg:0, fiber_g:0.68, notes:"Whole-wheat roti." },
  { food:"Kulcha", cuisine:"North Indian", category:"staple", display_amount:"1 piece", grams_per_display:70.0, protein_g:5.0, carbs_g:25.0, fat_g:8.0, calories:192.0, sugar_g:4.5, sodium_mg:0, fiber_g:2.0, notes:"Soft leavened bread." },
  { food:"Makki di Roti", cuisine:"North Indian", category:"staple", display_amount:"1 piece", grams_per_display:60.0, protein_g:4.0, carbs_g:20.0, fat_g:5.0, calories:141.0, sugar_g:3.6, sodium_mg:0, fiber_g:1.6, notes:"Cornmeal flatbread." },
  { food:"Missi Roti", cuisine:"North Indian", category:"staple", display_amount:"1 piece", grams_per_display:50.0, protein_g:5.0, carbs_g:18.0, fat_g:4.0, calories:128.0, sugar_g:3.24, sodium_mg:0, fiber_g:1.44, notes:"Gram flour and wheat flatbread." },
  { food:"Naan", cuisine:"North Indian", category:"staple", display_amount:"1 piece", grams_per_display:90.0, protein_g:7.92, carbs_g:48.6, fat_g:4.86, calories:263.7, sugar_g:8.75, sodium_mg:0, fiber_g:3.89, notes:"Plain naan." },
  { food:"Plain Paratha", cuisine:"North Indian", category:"staple", display_amount:"1 piece", grams_per_display:80.0, protein_g:5.6, carbs_g:28.8, fat_g:9.6, calories:237.6, sugar_g:5.18, sodium_mg:0, fiber_g:2.3, notes:"Pan-fried with oil/ghee." },
  { food:"Poori", cuisine:"North Indian", category:"staple", display_amount:"1 piece", grams_per_display:30.0, protein_g:1.8, carbs_g:11.7, fat_g:6.0, calories:109.5, sugar_g:2.11, sodium_mg:0, fiber_g:0.94, notes:"Deep-fried wheat bread." },
  { food:"Tandoori Roti", cuisine:"North Indian", category:"staple", display_amount:"1 piece", grams_per_display:60.0, protein_g:4.8, carbs_g:28.8, fat_g:1.5, calories:150.0, sugar_g:5.18, sodium_mg:0, fiber_g:2.3, notes:"Tandoor-baked wheat flatbread." },
  { food:"Bread (White)", cuisine:"Western", category:"staple", display_amount:"1 slice", grams_per_display:25.0, protein_g:2.25, carbs_g:12.25, fat_g:0.8, calories:66.5, sugar_g:2.21, sodium_mg:0, fiber_g:0.98, notes:"Standard white bread." },
  { food:"Bread (Whole Wheat)", cuisine:"Western", category:"staple", display_amount:"1 slice", grams_per_display:30.0, protein_g:3.9, carbs_g:12.3, fat_g:1.26, calories:74.1, sugar_g:2.21, sodium_mg:0, fiber_g:0.98, notes:"Whole wheat bread." },
  { food:"Butter", cuisine:"Western", category:"ingredient", display_amount:"1 tbsp", grams_per_display:14.0, protein_g:0.13, carbs_g:0.01, fat_g:11.34, calories:100.4, sugar_g:0.0, sodium_mg:0, fiber_g:0.0, notes:"Unsalted butter." },
  { food:"Almonds", cuisine:"Ingredient", category:"nut", display_amount:"1 handful", grams_per_display:28.0, protein_g:5.88, carbs_g:6.16, fat_g:14.0, calories:162.1, sugar_g:1.11, sodium_mg:0, fiber_g:0.49, notes:"Raw almonds." },
  { food:"Cashews", cuisine:"Ingredient", category:"nut", display_amount:"1 handful", grams_per_display:28.0, protein_g:5.04, carbs_g:8.4, fat_g:12.32, calories:154.8, sugar_g:1.51, sodium_mg:0, fiber_g:0.67, notes:"Raw cashews." },
  { food:"Mixed Dry Fruits", cuisine:"Ingredient", category:"nut", display_amount:"1 tbsp", grams_per_display:10.0, protein_g:1.5, carbs_g:4.0, fat_g:4.8, calories:60.0, sugar_g:0.72, sodium_mg:0, fiber_g:0.32, notes:"Mixed nuts and raisins." },
  { food:"Peanuts", cuisine:"Ingredient", category:"nut", display_amount:"1 handful", grams_per_display:28.0, protein_g:7.28, carbs_g:4.48, fat_g:13.72, calories:158.8, sugar_g:0.81, sodium_mg:0, fiber_g:0.36, notes:"Dry roasted peanuts." },
  { food:"Pistachios", cuisine:"Ingredient", category:"nut", display_amount:"1 tbsp", grams_per_display:10.0, protein_g:2.0, carbs_g:2.7, fat_g:5.0, calories:57.0, sugar_g:0.49, sodium_mg:0, fiber_g:0.22, notes:"Raw pistachios, spoon measure." },
  { food:"Walnuts", cuisine:"Ingredient", category:"nut", display_amount:"1 handful", grams_per_display:28.0, protein_g:4.2, carbs_g:3.92, fat_g:18.2, calories:183.1, sugar_g:0.71, sodium_mg:0, fiber_g:0.31, notes:"Raw walnuts." },
  { food:"Brazil Nuts", cuisine:"Nut", category:"nut", display_amount:"1 handful", grams_per_display:28.0, protein_g:4.0, carbs_g:3.44, fat_g:18.59, calories:184.52, sugar_g:0.62, sodium_mg:0, fiber_g:0.28, notes:"Brazil nuts, average handful." },
  { food:"Macadamia Nuts", cuisine:"Nut", category:"nut", display_amount:"1 handful", grams_per_display:28.0, protein_g:2.18, carbs_g:3.86, fat_g:21.22, calories:201.04, sugar_g:0.69, sodium_mg:0, fiber_g:0.31, notes:"Macadamia nuts, average handful." },
  { food:"Pecans", cuisine:"Nut", category:"nut", display_amount:"1 handful", grams_per_display:28.0, protein_g:2.58, carbs_g:3.89, fat_g:20.16, calories:193.48, sugar_g:0.7, sodium_mg:0, fiber_g:0.31, notes:"Pecans, average handful." },
  { food:"Chickpeas (Cooked)", cuisine:"Ingredient", category:"legume", display_amount:"1 cup", grams_per_display:164.0, protein_g:14.6, carbs_g:44.94, fat_g:4.26, calories:269.0, sugar_g:8.09, sodium_mg:0, fiber_g:3.6, notes:"Boiled chickpeas." },
  { food:"Lentils (Cooked)", cuisine:"Ingredient", category:"legume", display_amount:"1 cup", grams_per_display:198.0, protein_g:17.82, carbs_g:39.8, fat_g:0.79, calories:229.7, sugar_g:7.16, sodium_mg:0, fiber_g:3.18, notes:"Boiled lentils." },
  { food:"Rajma (Cooked)", cuisine:"Ingredient", category:"legume", display_amount:"1 cup", grams_per_display:177.0, protein_g:15.4, carbs_g:40.36, fat_g:0.89, calories:224.8, sugar_g:7.26, sodium_mg:0, fiber_g:3.23, notes:"Boiled kidney beans." },
  { food:"Sprouts", cuisine:"Ingredient", category:"legume", display_amount:"1 cup", grams_per_display:100.0, protein_g:4.0, carbs_g:7.0, fat_g:0.5, calories:35.0, sugar_g:1.26, sodium_mg:0, fiber_g:0.56, notes:"Mixed sprouts, raw." },
  { food:"Dates Chopped", cuisine:"Ingredient", category:"sweetener", display_amount:"1 tbsp", grams_per_display:10.0, protein_g:0.3, carbs_g:7.5, fat_g:0.0, calories:28.0, sugar_g:1.35, sodium_mg:0, fiber_g:0.6, notes:"Chopped dates, spoon measure." },
  { food:"Honey", cuisine:"Ingredient", category:"sweetener", display_amount:"1 tbsp", grams_per_display:21.0, protein_g:0.06, carbs_g:17.22, fat_g:0.0, calories:63.8, sugar_g:3.1, sodium_mg:0, fiber_g:1.38, notes:"Pure honey." },
  { food:"Jaggery", cuisine:"Ingredient", category:"sweetener", display_amount:"1 piece", grams_per_display:10.0, protein_g:0.0, carbs_g:9.8, fat_g:0.0, calories:38.3, sugar_g:1.76, sodium_mg:0, fiber_g:0.78, notes:"Unrefined sugar." },
  { food:"Raisins", cuisine:"Ingredient", category:"sweetener", display_amount:"1 tbsp", grams_per_display:10.0, protein_g:0.3, carbs_g:8.0, fat_g:0.0, calories:30.0, sugar_g:1.44, sodium_mg:0, fiber_g:0.64, notes:"Raisins, spoon measure." },
  { food:"Sugar", cuisine:"Ingredient", category:"sweetener", display_amount:"1 tsp", grams_per_display:4.0, protein_g:0.0, carbs_g:4.0, fat_g:0.0, calories:15.5, sugar_g:0.72, sodium_mg:0, fiber_g:0.32, notes:"Table sugar." },
  { food:"Chia Seeds", cuisine:"Ingredient", category:"seed", display_amount:"1 tbsp", grams_per_display:12.0, protein_g:2.04, carbs_g:5.04, fat_g:3.72, calories:58.3, sugar_g:0.91, sodium_mg:0, fiber_g:0.4, notes:"Dry chia seeds." },
];

// ─── Modal phase type ─────────────────────────────────────────────────────────
type ModalPhase = "main" | "search" | "quantity" | "custom";

const GOAL = 2000;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NutritionScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const {
    totals, selectedProfile, foodEntries, mealReminders,
    addFoodEntry, removeFoodEntry, setProfile,
    toggleReminder, updateReminderTime, getMealEntries,
  } = useNutrition();

  const { addEvent } = useBiogearsTwin();
  const { calories, protein, carbs, fat, sugar, sodium, fiber } = totals;

  const colors = theme === "light"
    ? {
        bg: "#f8fafc", card: "#ffffff", text: "#020617", sub: "#64748b",
        border: "#e2e8f0", accent: "#0ea5e9", success: "#10b981",
        warning: "#f59e0b", danger: "#ef4444", purple: "#8b5cf6",
        orange: "#f97316", searchBg: "#f1f5f9",
      }
    : {
        bg: "#020617", card: "#1e293b", text: "#ffffff", sub: "#94a3b8",
        border: "#334155", accent: "#38bdf8", success: "#22c55e",
        warning: "#f59e0b", danger: "#ef4444", purple: "#a78bfa",
        orange: "#fb923c", searchBg: "#0f172a",
      };

  // ── Modal state ──────────────────────────────────────────────────────────
  const [modalVisible, setModalVisible]           = useState(false);
  const [selectedMeal, setSelectedMeal]           = useState<typeof mealTypes[0] | null>(null);
  const [modalPhase, setModalPhase]               = useState<ModalPhase>("main");
  const [searchQuery, setSearchQuery]             = useState("");
  const searchInputRef                            = useRef<TextInput>(null);
  const [selectedCsvFood, setSelectedCsvFood]     = useState<CsvFoodItem | null>(null);
  const [quantity, setQuantity]                   = useState(1);
  const [customFood, setCustomFood]               = useState("");
  const [customCalories, setCustomCalories]       = useState("");
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [editingReminder, setEditingReminder]     = useState<typeof mealReminders[0] | null>(null);
  const [showTimePicker, setShowTimePicker]       = useState(false);
  const [aiTip, setAiTip]                         = useState("");

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  useEffect(() => { generateAITip(); }, [selectedProfile, calories, protein, sugar, sodium]);

  const generateAITip = () => {
    const rec = selectedProfile.recommendations;
    const proteinPct   = (protein / rec.protein) * 100;
    const sugarPct     = (sugar   / rec.sugar)   * 100;
    const sodiumPct    = (sodium  / rec.sodium)   * 100;
    const remainingCal = rec.calories - calories;
    let tip = "";
    if (sodiumPct > 90)        tip = "⚠️ High sodium intake! Choose low-sodium options next.";
    else if (sugarPct > 90)    tip = "🍬 Sugar alert! Opt for fruits instead of processed sweets.";
    else if (proteinPct < 50)  tip = "💪 Increase protein with lean meats, eggs, or legumes.";
    else if (remainingCal < 300) tip = "🎯 Close to your calorie goal! Make the next meal count.";
    else {
      const idx = Math.floor(Math.random() * selectedProfile.tips.length);
      tip = `💡 ${selectedProfile.tips[idx]}`;
    }
    setAiTip(tip);
  };

  // ── Live search across all 456 items ────────────────────────────────────
  const searchResults = useMemo<CsvFoodItem[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return CSV_FOOD_DB.slice(0, 40);
    return CSV_FOOD_DB.filter(
      (item) =>
        item.food.toLowerCase().includes(q) ||
        item.cuisine.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q)
    ).slice(0, 60);
  }, [searchQuery]);

  // ── Quantity helpers ─────────────────────────────────────────────────────
  const parsedUnit = useMemo(() => {
    if (!selectedCsvFood) return { base: 1, unit: "serving", unitLabel: "servings" };
    return parseDisplayAmount(selectedCsvFood.display_amount);
  }, [selectedCsvFood]);

  const multiplier = quantity / parsedUnit.base;

  const scaled = useMemo(() => {
    if (!selectedCsvFood) return null;
    return scaleNutrients(selectedCsvFood, multiplier);
  }, [selectedCsvFood, multiplier]);

  const step = (() => {
    const u = parsedUnit.unit.toLowerCase();
    if (["g", "ml"].includes(u)) return 10;
    return 1;
  })();

  // ── Add confirmed food ───────────────────────────────────────────────────
  const confirmFoodWithQuantity = useCallback(() => {
    if (!selectedCsvFood || !selectedMeal || !scaled) return;
    const displayQty = `${quantity} ${parsedUnit.unitLabel}`;
    const label = `${selectedCsvFood.food} (${displayQty})`;
    addFoodEntry({
      mealId: selectedMeal.id, foodId: `csv_${selectedCsvFood.food.replace(/\s/g,"_")}_${Date.now()}`,
      foodName: label, calories: scaled.calories, protein: scaled.protein,
      carbs: scaled.carbs, fat: scaled.fat, sugar: scaled.sugar,
      sodium: scaled.sodium, fiber: scaled.fiber,
    });
    try {
      addEvent({
        event_type: "meal", value: scaled.calories,
        wallTime: new Date().toTimeString().slice(0, 5),
        meal_type: selectedMeal.id as any,
        carb_g: scaled.carbs, fat_g: scaled.fat, protein_g: scaled.protein,
        displayLabel: `${selectedMeal.label} · ${label} (${scaled.calories} kcal)`,
        displayIcon: selectedMeal.icon,
      });
    } catch (err) { console.error("BioGears sync error:", err); }
    closeModal();
    Alert.alert("✅ Added", `${label} added to ${selectedMeal.label}`);
  }, [selectedCsvFood, selectedMeal, scaled, quantity, parsedUnit]);

  // ── Custom food entry ────────────────────────────────────────────────────
  const handleAddCustomFood = () => {
    if (!selectedMeal || !customFood || !customCalories) return;
    const cal = parseInt(customCalories);
    if (isNaN(cal)) return;
    addFoodEntry({
      mealId: selectedMeal.id, foodId: `custom_${Date.now()}`,
      foodName: customFood, calories: cal,
      protein: 0, carbs: 0, fat: 0, sugar: 0, sodium: 0, fiber: 0,
    });
    try {
      addEvent({
        event_type: "meal", value: cal,
        wallTime: new Date().toTimeString().slice(0, 5),
        meal_type: selectedMeal.id as any,
        displayLabel: `${selectedMeal.label} · ${customFood} (${cal} kcal)`,
        displayIcon: selectedMeal.icon,
      });
    } catch (err) { console.error("BioGears sync error:", err); }
    closeModal();
    Alert.alert("✅ Added", `${customFood} added to ${selectedMeal.label}`);
  };

  const closeModal = () => {
    setModalVisible(false); setModalPhase("main"); setSearchQuery("");
    setSelectedCsvFood(null); setQuantity(1); setCustomFood(""); setCustomCalories("");
  };

  const openMealModal = (meal: typeof mealTypes[0]) => {
    setSelectedMeal(meal); setModalPhase("main"); setModalVisible(true);
  };

  const openSearch = () => {
    setModalPhase("search");
    setTimeout(() => searchInputRef.current?.focus(), 200);
  };

  const selectFoodForQuantity = (food: CsvFoodItem) => {
    setSelectedCsvFood(food);
    setQuantity(parseDisplayAmount(food.display_amount).base);
    setModalPhase("quantity");
  };

  // ── Ring ─────────────────────────────────────────────────────────────────
  const progress      = Math.min(calories / GOAL, 1);
  const radius        = 54;
  const circumference = 2 * Math.PI * radius;
  const offset        = circumference * (1 - progress);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>NUTRITION</Text>
        <TouchableOpacity onPress={() => setShowReminderModal(true)}>
          <Ionicons name="notifications-outline" size={24} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Calories Ring */}
          <View style={styles.hud}>
            <Svg width={140} height={140}>
              <G rotation="-90" origin="70,70">
                <Circle cx="70" cy="70" r={radius} stroke={colors.border} strokeWidth="12" fill="none" />
                <Circle cx="70" cy="70" r={radius} stroke={colors.accent} strokeWidth="12"
                  strokeDasharray={circumference} strokeDashoffset={offset}
                  strokeLinecap="round" fill="none" />
              </G>
            </Svg>
            <View style={styles.ringText}>
              <Text style={[styles.kcal, { color: colors.text }]}>{GOAL - calories}</Text>
              <Text style={[styles.kcalSub, { color: colors.sub }]}>KCAL LEFT</Text>
            </View>
          </View>

          {/* Macros Grid */}
          <View style={styles.macrosGrid}>
            {[
              { label:"Protein", value:protein, unit:"g", color:colors.accent,  pct:(protein/selectedProfile.recommendations.protein)*100 },
              { label:"Carbs",   value:carbs,   unit:"g", color:colors.orange,  pct:(carbs  /selectedProfile.recommendations.carbs)  *100 },
              { label:"Fat",     value:fat,     unit:"g", color:colors.warning, pct:(fat    /selectedProfile.recommendations.fat)    *100 },
              { label:"Fiber",   value:fiber,   unit:"g", color:colors.success, pct:(fiber  /selectedProfile.recommendations.fiber)  *100 },
            ].map((m) => (
              <View key={m.label} style={[styles.macroCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.macroValue, { color: m.color }]}>{Math.round(m.value)}{m.unit}</Text>
                <Text style={[styles.macroLabel, { color: colors.sub }]}>{m.label}</Text>
                <View style={[styles.macroBar, { backgroundColor: colors.border }]}>
                  <View style={[styles.macroFill, { width:`${Math.min(100,m.pct)}%`, backgroundColor:m.color }]} />
                </View>
                <Text style={[styles.macroTarget, { color:colors.sub }]}>
                  / {m.label==="Protein"?selectedProfile.recommendations.protein
                     :m.label==="Carbs" ?selectedProfile.recommendations.carbs
                     :m.label==="Fat"   ?selectedProfile.recommendations.fat
                     :selectedProfile.recommendations.fiber}{m.unit} goal
                </Text>
              </View>
            ))}
          </View>

          {/* Health Profiles */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.profilesScroll}>
            {healthProfiles.map((profile) => (
              <TouchableOpacity key={profile.id}
                style={[styles.profileChip, {
                  backgroundColor: selectedProfile.id===profile.id ? profile.color : colors.card,
                  borderColor: profile.color,
                }]}
                onPress={() => setProfile(profile.id)}
              >
                <Text style={styles.profileIcon}>{profile.icon}</Text>
                <Text style={[styles.profileLabel, { color: selectedProfile.id===profile.id ? "#fff" : colors.text }]}>
                  {profile.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* AI Tip */}
          <LinearGradient colors={[colors.accent+"20", colors.purple+"20"]}
            start={{x:0,y:0}} end={{x:1,y:0}}
            style={[styles.aiCard, { borderColor:colors.accent }]}>
            <Ionicons name="bulb" size={24} color={colors.accent} />
            <Text style={[styles.aiTipText, { color:colors.text }]}>{aiTip || "Loading insights..."}</Text>
          </LinearGradient>

          {/* Micros */}
          <View style={styles.microsRow}>
            <View style={[styles.microBadge, { backgroundColor:colors.danger+"20" }]}>
              <Ionicons name="warning" size={14} color={colors.danger} />
              <Text style={[styles.microText, { color:colors.danger }]}>
                Sodium: {Math.round(sodium)}mg / {selectedProfile.recommendations.sodium}mg
              </Text>
            </View>
            <View style={[styles.microBadge, { backgroundColor:colors.warning+"20" }]}>
              <Ionicons name="flash" size={14} color={colors.warning} />
              <Text style={[styles.microText, { color:colors.warning }]}>
                Sugar: {Math.round(sugar)}g / {selectedProfile.recommendations.sugar}g
              </Text>
            </View>
          </View>

          {/* Meals */}
          <Text style={[styles.sectionTitle, { color:colors.text }]}>Today's Meals</Text>
          {mealTypes.map((meal) => {
            const entries       = getMealEntries(meal.id);
            const reminder      = mealReminders.find((r) => r.mealId === meal.id);
            const totalMealCals = entries.reduce((s, e) => s + e.calories, 0);
            return (
              <TouchableOpacity key={meal.id}
                style={[styles.mealCard, { backgroundColor:colors.card }]}
                onPress={() => openMealModal(meal)}
              >
                <View style={styles.mealHeader}>
                  <View style={styles.mealLeft}>
                    <Text style={styles.mealIcon}>{meal.icon}</Text>
                    <View>
                      <Text style={[styles.mealTitle, { color:colors.text }]}>{meal.label}</Text>
                      {reminder?.enabled && (
                        <Text style={[styles.mealTime, { color:colors.accent }]}>⏰ {reminder.time}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.mealRight}>
                    <Text style={[styles.mealCalories, { color:colors.accent }]}>{totalMealCals} cal</Text>
                    {entries.length > 0 && (
                      <TouchableOpacity onPress={() =>
                        Alert.alert("Remove Last Item", "Remove the last item?", [
                          { text:"Cancel", style:"cancel" },
                          { text:"Remove", style:"destructive",
                            onPress:() => removeFoodEntry(entries[entries.length-1].id) },
                        ])
                      }>
                        <Ionicons name="close-circle" size={20} color={colors.sub} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                {entries.length > 0 && (
                  <View style={[styles.foodList, { borderTopColor:colors.border }]}>
                    {entries.map((entry) => (
                      <Text key={entry.id} style={[styles.foodItem, { color:colors.sub }]}>
                        • {entry.foodName} ({entry.calories} cal)
                      </Text>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
          <View style={{ height:32 }} />
        </Animated.View>
      </ScrollView>

      {/* ════════════════════════════════════════════════
          FOOD ENTRY MODAL (multi-phase)
          FIX 1: KeyboardAvoidingView wraps the BlurView
          FIX 2: Search phase uses fixed header + flex list
      ════════════════════════════════════════════════ */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.kavFull}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <BlurView intensity={60} style={[styles.modalOverlay, modalPhase === "search" && styles.modalOverlaySearch]}>
            <View style={[
              styles.modalCard,
              { backgroundColor:colors.card },
              modalPhase === "search" && styles.modalCardSearch,
            ]}>

              {/* ── Modal Header (always visible) ── */}
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  {modalPhase !== "main" && (
                    <TouchableOpacity
                      onPress={() => {
                        if (modalPhase==="quantity") setModalPhase("search");
                        else setModalPhase("main");
                      }}
                      style={styles.backBtn}
                    >
                      <Ionicons name="chevron-back" size={22} color={colors.accent} />
                    </TouchableOpacity>
                  )}
                  <View>
                    <Text style={[styles.modalTitle, { color:colors.text }]}>{selectedMeal?.label ?? "Add Food"}</Text>
                    <Text style={[styles.modalSubtag, { color:colors.sub }]}>
                      {modalPhase==="main"     ? "How would you like to add food?"
                       :modalPhase==="search"  ? `${searchResults.length} items · type to filter`
                       :modalPhase==="quantity"? selectedCsvFood?.food ?? ""
                       :                        "Enter custom food"}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={closeModal}>
                  <Ionicons name="close" size={24} color={colors.sub} />
                </TouchableOpacity>
              </View>

              {/* ── PHASE: MAIN ── */}
              {modalPhase === "main" && (
                <>
                  <TouchableOpacity
                    style={[styles.mainOptionBtn, { backgroundColor:colors.accent }]}
                    onPress={openSearch}
                  >
                    <View style={styles.mainOptionInner}>
                      <View style={[styles.mainOptionIcon, { backgroundColor:"rgba(255,255,255,0.2)" }]}>
                        <Ionicons name="search" size={22} color="#fff" />
                      </View>
                      <View style={styles.mainOptionText}>
                        <Text style={styles.mainOptionTitle}>Search Food Database</Text>
                        <Text style={styles.mainOptionSub}>{CSV_FOOD_DB.length} items from BioGears CSV</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.orDivider}>
                    <View style={[styles.orLine, { backgroundColor:colors.border }]} />
                    <Text style={[styles.orText, { color:colors.sub }]}>OR</Text>
                    <View style={[styles.orLine, { backgroundColor:colors.border }]} />
                  </View>

                  <TouchableOpacity
                    style={[styles.mainOptionBtn, { backgroundColor:colors.card, borderWidth:1, borderColor:colors.border }]}
                    onPress={() => setModalPhase("custom")}
                  >
                    <View style={styles.mainOptionInner}>
                      <View style={[styles.mainOptionIcon, { backgroundColor:colors.border }]}>
                        <Ionicons name="pencil" size={22} color={colors.text} />
                      </View>
                      <View style={styles.mainOptionText}>
                        <Text style={[styles.mainOptionTitle, { color:colors.text }]}>Enter Custom Food</Text>
                        <Text style={[styles.mainOptionSub, { color:colors.sub }]}>Manually add name & calories</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.sub} />
                    </View>
                  </TouchableOpacity>
                </>
              )}

              {/* ── PHASE: SEARCH ──
                  FIX: Search bar is FIXED at top; only the FlatList scrolls below it.
                  The modal card uses flex column, search bar has fixed height, list uses flex:1.
              ── */}
              {modalPhase === "search" && (
                <View style={styles.searchPhaseContainer}>
                  {/* Fixed search bar — never moves */}
                  <View style={[styles.searchBar, { backgroundColor:colors.searchBg, borderColor:colors.border }]}>
                    <Ionicons name="search" size={18} color={colors.sub} />
                    <TextInput
                      ref={searchInputRef}
                      placeholder="e.g. idli, coffee, chicken, dosa..."
                      placeholderTextColor={colors.sub}
                      style={[styles.searchInput, { color:colors.text }]}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      autoCorrect={false}
                      autoCapitalize="none"
                      returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery("")}>
                        <Ionicons name="close-circle" size={18} color={colors.sub} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Scrollable results — flex:1 fills remaining space */}
                  <FlatList
                    data={searchResults}
                    keyExtractor={(item, idx) => `${item.food}_${idx}`}
                    style={styles.resultsList}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                      <View style={styles.emptyState}>
                        <Text style={styles.emptyEmoji}>🔍</Text>
                        <Text style={[styles.emptyText, { color:colors.sub }]}>No results found</Text>
                        <Text style={[styles.emptyHint, { color:colors.sub }]}>Try a different word or add as custom</Text>
                      </View>
                    }
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.resultRow, { borderBottomColor:colors.border }]}
                        onPress={() => selectFoodForQuantity(item)}
                      >
                        <View style={styles.resultLeft}>
                          <View style={[styles.categoryDot, { backgroundColor:getCategoryColor(item.category, colors) }]} />
                          <View style={styles.resultTextBlock}>
                            <Text style={[styles.resultName, { color:colors.text }]}>{item.food}</Text>
                            <Text style={[styles.resultMeta, { color:colors.sub }]}>
                              {item.cuisine} · {item.display_amount} · {item.calories} kcal
                            </Text>
                          </View>
                        </View>
                        <View style={styles.resultRight}>
                          <Text style={[styles.resultCal, { color:colors.accent }]}>{item.calories}</Text>
                          <Text style={[styles.resultCalLabel, { color:colors.sub }]}>kcal</Text>
                          <Ionicons name="add-circle" size={24} color={colors.accent} style={{ marginLeft:8 }} />
                        </View>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}

              {/* ── PHASE: QUANTITY ── */}
              {modalPhase === "quantity" && selectedCsvFood && scaled && (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 16 }}
                >
                  <View style={[styles.qFoodCard, { backgroundColor:colors.searchBg, borderColor:colors.border }]}>
                    <View style={styles.qFoodRow}>
                      <View style={[styles.categoryDot, { backgroundColor:getCategoryColor(selectedCsvFood.category, colors), width:10, height:10, borderRadius:5 }]} />
                      <Text style={[styles.qFoodCuisine, { color:colors.sub }]}>{selectedCsvFood.cuisine} · {selectedCsvFood.category}</Text>
                    </View>
                    <Text style={[styles.qFoodName, { color:colors.text }]}>{selectedCsvFood.food}</Text>
                    <Text style={[styles.qBaseAmount, { color:colors.sub }]}>Base: {selectedCsvFood.display_amount} = {selectedCsvFood.calories} kcal</Text>
                  </View>

                  <Text style={[styles.qQuestion, { color:colors.text }]}>
                    How many {parsedUnit.unitLabel}?
                  </Text>

                  <View style={styles.qPicker}>
                    <TouchableOpacity
                      style={[styles.qBtn, { backgroundColor:colors.border }]}
                      onPress={() => { const n = quantity - step; if (n >= step) setQuantity(n); }}
                      disabled={quantity <= step}
                    >
                      <Ionicons name="remove" size={24} color={quantity <= step ? colors.sub : colors.text} />
                    </TouchableOpacity>

                    <View style={[styles.qValueBox, { backgroundColor:colors.searchBg, borderColor:colors.accent }]}>
                      <TextInput
                        style={[styles.qValueInput, { color:colors.text }]}
                        value={String(quantity)}
                        onChangeText={(t) => { const n = parseFloat(t); if (!isNaN(n) && n > 0) setQuantity(n); }}
                        keyboardType="numeric"
                        selectTextOnFocus
                      />
                      <Text style={[styles.qUnit, { color:colors.sub }]}>{parsedUnit.unitLabel}</Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.qBtn, { backgroundColor:colors.accent }]}
                      onPress={() => setQuantity((q) => q + step)}
                    >
                      <Ionicons name="add" size={24} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  {/* Quick chips */}
                  <View style={styles.qChips}>
                    {getQuickQuantities(parsedUnit.base, parsedUnit.unit).map((q) => (
                      <TouchableOpacity key={q}
                        style={[styles.qChip, {
                          backgroundColor: quantity===q ? colors.accent : colors.searchBg,
                          borderColor: quantity===q ? colors.accent : colors.border,
                        }]}
                        onPress={() => setQuantity(q)}
                      >
                        <Text style={[styles.qChipText, { color: quantity===q ? "#fff" : colors.text }]}>
                          {q} {parsedUnit.unitLabel}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Nutrition preview */}
                  <View style={[styles.qNutrPanel, { backgroundColor:colors.searchBg, borderColor:colors.border }]}>
                    <Text style={[styles.qNutrTitle, { color:colors.text }]}>
                      Nutrition for {quantity} {parsedUnit.unitLabel}
                    </Text>
                    <View style={styles.qNutrGrid}>
                      {[
                        { label:"Calories", value:`${scaled.calories} kcal`, color:colors.accent },
                        { label:"Protein",  value:`${scaled.protein}g`,       color:colors.accent },
                        { label:"Carbs",    value:`${scaled.carbs}g`,          color:colors.orange },
                        { label:"Fat",      value:`${scaled.fat}g`,            color:colors.warning },
                        { label:"Fiber",    value:`${scaled.fiber}g`,          color:colors.success },
                        { label:"Sugar",    value:`${scaled.sugar}g`,          color:colors.danger },
                      ].map((n) => (
                        <View key={n.label} style={styles.qNutrItem}>
                          <Text style={[styles.qNutrValue, { color:n.color }]}>{n.value}</Text>
                          <Text style={[styles.qNutrLabel, { color:colors.sub }]}>{n.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor:colors.success }]}
                    onPress={confirmFoodWithQuantity}
                  >
                    <Ionicons name="checkmark-circle" size={22} color="#fff" />
                    <Text style={styles.confirmBtnText}>
                      Add {scaled.calories} kcal to {selectedMeal?.label}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              )}

              {/* ── PHASE: CUSTOM ──
                  FIX: Wrapped in ScrollView so inputs scroll above keyboard
              ── */}
              {modalPhase === "custom" && (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.customScrollContent}
                >
                  <Text style={[styles.customHint, { color:colors.sub }]}>
                    Can't find your food? Enter it manually below.
                  </Text>
                  <TextInput
                    placeholder="Food name (e.g. Homemade Dal)"
                    placeholderTextColor={colors.sub}
                    style={[styles.input, { backgroundColor:colors.searchBg, color:colors.text, borderColor:colors.border }]}
                    value={customFood}
                    onChangeText={setCustomFood}
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />
                  <TextInput
                    placeholder="Calories (kcal)"
                    placeholderTextColor={colors.sub}
                    style={[styles.input, { backgroundColor:colors.searchBg, color:colors.text, borderColor:colors.border }]}
                    value={customCalories}
                    onChangeText={setCustomCalories}
                    keyboardType="numeric"
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor: customFood && customCalories ? colors.success : colors.border }]}
                    onPress={handleAddCustomFood}
                    disabled={!customFood || !customCalories}
                  >
                    <Ionicons name="add-circle" size={22} color="#fff" />
                    <Text style={styles.confirmBtnText}>Add Custom Food</Text>
                  </TouchableOpacity>
                  {/* Extra bottom padding so button clears keyboard */}
                  <View style={{ height: 40 }} />
                </ScrollView>
              )}
            </View>
          </BlurView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Reminder Modal ── */}
      <Modal visible={showReminderModal} transparent animationType="slide">
        <BlurView intensity={60} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor:colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color:colors.text }]}>Meal Reminders</Text>
              <TouchableOpacity onPress={() => setShowReminderModal(false)}>
                <Ionicons name="close" size={24} color={colors.sub} />
              </TouchableOpacity>
            </View>
            {mealReminders.map((reminder) => (
              <View key={reminder.id} style={[styles.reminderRow, { borderBottomColor:colors.border }]}>
                <View style={styles.reminderInfo}>
                  <Text style={[styles.reminderMeal, { color:colors.text }]}>{reminder.mealName}</Text>
                  <TouchableOpacity onPress={() => { setEditingReminder(reminder); setShowTimePicker(true); }}>
                    <Text style={[styles.reminderTime, { color:colors.accent }]}>{reminder.time}</Text>
                  </TouchableOpacity>
                </View>
                <Switch value={reminder.enabled} onValueChange={() => toggleReminder(reminder.id)}
                  trackColor={{ false:colors.border, true:colors.accent }} />
              </View>
            ))}
            <Text style={[styles.reminderNote, { color:colors.sub }]}>
              Set your preferred meal times. Reminders are saved locally.
            </Text>
          </View>
        </BlurView>
      </Modal>

      {/* Time Picker */}
      {showTimePicker && editingReminder && (
        <DateTimePicker
          value={(() => {
            const [h,m] = editingReminder.time.split(":").map(Number);
            const d = new Date(); d.setHours(h,m,0,0); return d;
          })()}
          mode="time" is24Hour={false} display="default"
          onChange={(_,date) => {
            if (date) {
              const t = date.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", hour12:false });
              updateReminderTime(editingReminder.id, t);
            }
            setShowTimePicker(false); setEditingReminder(null);
          }}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:        { flex:1 },
  header:      { paddingTop:60, paddingHorizontal:20, flexDirection:"row", justifyContent:"space-between", alignItems:"center" },
  headerTitle: { fontSize:20, fontWeight:"700" },
  hud:         { alignItems:"center", marginVertical:20, position:"relative" },
  ringText:    { position:"absolute", top:42, alignItems:"center" },
  kcal:        { fontSize:28, fontWeight:"bold" },
  kcalSub:     { fontSize:11, marginTop:2 },
  macrosGrid:  { flexDirection:"row", flexWrap:"wrap", paddingHorizontal:16, gap:12, marginBottom:20 },
  macroCard:   { width:"47%", padding:16, borderRadius:20, marginBottom:8 },
  macroValue:  { fontSize:24, fontWeight:"700" },
  macroLabel:  { fontSize:13, marginTop:2 },
  macroBar:    { height:4, borderRadius:2, marginTop:8 },
  macroFill:   { height:4, borderRadius:2 },
  macroTarget: { fontSize:10, marginTop:4 },
  profilesScroll: { paddingHorizontal:16, marginBottom:16 },
  profileChip:    { flexDirection:"row", alignItems:"center", paddingHorizontal:16, paddingVertical:10, borderRadius:24, marginRight:10, borderWidth:1 },
  profileIcon:    { fontSize:18, marginRight:6 },
  profileLabel:   { fontSize:14, fontWeight:"500" },
  aiCard:     { flexDirection:"row", alignItems:"center", padding:16, marginHorizontal:16, marginBottom:16, borderRadius:20, borderWidth:1, gap:12 },
  aiTipText:  { flex:1, fontSize:14, lineHeight:20 },
  microsRow:  { flexDirection:"row", paddingHorizontal:16, gap:10, marginBottom:20, flexWrap:"wrap" },
  microBadge: { flexDirection:"row", alignItems:"center", paddingHorizontal:12, paddingVertical:6, borderRadius:16, gap:4 },
  microText:  { fontSize:12, fontWeight:"500" },
  sectionTitle: { fontSize:18, fontWeight:"700", paddingHorizontal:16, marginBottom:12 },
  mealCard:    { marginHorizontal:16, marginBottom:10, padding:16, borderRadius:20 },
  mealHeader:  { flexDirection:"row", justifyContent:"space-between", alignItems:"center" },
  mealLeft:    { flexDirection:"row", alignItems:"center", gap:12 },
  mealIcon:    { fontSize:30 },
  mealTitle:   { fontSize:16, fontWeight:"600" },
  mealTime:    { fontSize:11, marginTop:2 },
  mealRight:   { flexDirection:"row", alignItems:"center", gap:8 },
  mealCalories:{ fontSize:14, fontWeight:"600" },
  foodList:    { marginTop:12, paddingTop:12, borderTopWidth:1 },
  foodItem:    { fontSize:13, marginBottom:4 },

  // ── Modal layout ──
  // FIX: kavFull fills the screen so KeyboardAvoidingView works correctly
  kavFull:              { flex:1 },
  modalOverlay:         { flex:1, justifyContent:"flex-end", padding:12, paddingBottom:28 },
  // FIX: search mode overlay — extra top padding pushes card down so it doesn't bleed into bg
  modalOverlaySearch:   { justifyContent:"flex-end", paddingTop:80 },
  // FIX: search mode card — flex:1 lets KAV shrink it when keyboard opens
  modalCardSearch:      { flex:1, maxHeight:"100%" },
  modalCard:            { borderRadius:28, padding:20, maxHeight:"90%", flexDirection:"column" },
  modalHeader:      { flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 },
  modalHeaderLeft:  { flexDirection:"row", alignItems:"center", gap:6, flex:1 },
  backBtn:          { padding:4, marginRight:4 },
  modalTitle:       { fontSize:20, fontWeight:"700" },
  modalSubtag:      { fontSize:12, marginTop:2 },
  mainOptionBtn:    { borderRadius:18, marginBottom:12, overflow:"hidden" },
  mainOptionInner:  { flexDirection:"row", alignItems:"center", padding:16, gap:14 },
  mainOptionIcon:   { width:44, height:44, borderRadius:12, alignItems:"center", justifyContent:"center" },
  mainOptionText:   { flex:1 },
  mainOptionTitle:  { fontSize:16, fontWeight:"600", color:"#fff" },
  mainOptionSub:    { fontSize:12, color:"rgba(255,255,255,0.7)", marginTop:2 },
  orDivider: { flexDirection:"row", alignItems:"center", marginVertical:16 },
  orLine:    { flex:1, height:1 },
  orText:    { marginHorizontal:10, fontSize:13 },

  // FIX: Search phase — column flex so bar is fixed and list scrolls
  searchPhaseContainer: { flex:1, flexDirection:"column" },
  searchBar:     { flexDirection:"row", alignItems:"center", borderWidth:1, borderRadius:14, paddingHorizontal:12, paddingVertical:10, gap:8, marginBottom:14 },
  searchInput:   { flex:1, fontSize:15, padding:0 },
  // FIX: flex:1 instead of maxHeight so it fills available space without pushing bar
  resultsList:   { flex:1 },

  resultRow:     { flexDirection:"row", justifyContent:"space-between", alignItems:"center", paddingVertical:12, borderBottomWidth:StyleSheet.hairlineWidth },
  resultLeft:    { flexDirection:"row", alignItems:"center", flex:1, gap:10 },
  categoryDot:   { width:8, height:8, borderRadius:4 },
  resultTextBlock:{ flex:1 },
  resultName:    { fontSize:15, fontWeight:"600" },
  resultMeta:    { fontSize:12, marginTop:2 },
  resultRight:   { flexDirection:"row", alignItems:"center" },
  resultCal:     { fontSize:16, fontWeight:"700" },
  resultCalLabel:{ fontSize:11, marginLeft:2 },
  emptyState:    { alignItems:"center", paddingVertical:40 },
  emptyEmoji:    { fontSize:40, marginBottom:8 },
  emptyText:     { fontSize:16, fontWeight:"600", marginBottom:4 },
  emptyHint:     { fontSize:13 },
  qFoodCard:     { borderWidth:1, borderRadius:16, padding:14, marginBottom:16 },
  qFoodRow:      { flexDirection:"row", alignItems:"center", gap:6, marginBottom:4 },
  qFoodCuisine:  { fontSize:12 },
  qFoodName:     { fontSize:18, fontWeight:"700", marginBottom:2 },
  qBaseAmount:   { fontSize:12 },
  qQuestion:     { fontSize:17, fontWeight:"600", textAlign:"center", marginBottom:16 },
  qPicker:       { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:16, marginBottom:16 },
  qBtn:          { width:52, height:52, borderRadius:26, alignItems:"center", justifyContent:"center" },
  qValueBox:     { alignItems:"center", borderWidth:2, borderRadius:16, paddingHorizontal:20, paddingVertical:10, minWidth:100 },
  qValueInput:   { fontSize:28, fontWeight:"800", textAlign:"center", padding:0 },
  qUnit:         { fontSize:12, marginTop:2 },
  qChips:        { flexDirection:"row", flexWrap:"wrap", gap:8, justifyContent:"center", marginBottom:16 },
  qChip:         { paddingHorizontal:14, paddingVertical:8, borderRadius:20, borderWidth:1 },
  qChipText:     { fontSize:13, fontWeight:"500" },
  qNutrPanel:    { borderWidth:1, borderRadius:16, padding:14, marginBottom:16 },
  qNutrTitle:    { fontSize:13, fontWeight:"600", marginBottom:10 },
  qNutrGrid:     { flexDirection:"row", flexWrap:"wrap", gap:8 },
  qNutrItem:     { width:"30%", alignItems:"center" },
  qNutrValue:    { fontSize:15, fontWeight:"700" },
  qNutrLabel:    { fontSize:11, marginTop:2 },
  // FIX: custom scroll area fills space and scrolls content above keyboard
  customScrollContent: { paddingBottom: 8 },
  customHint:    { fontSize:13, marginBottom:16, lineHeight:20 },
  input:         { borderWidth:1, padding:14, borderRadius:14, marginBottom:12, fontSize:15 },
  confirmBtn:    { flexDirection:"row", alignItems:"center", justifyContent:"center", padding:16, borderRadius:18, gap:10 },
  confirmBtnText:{ color:"#fff", fontSize:16, fontWeight:"700" },
  reminderRow:   { flexDirection:"row", justifyContent:"space-between", alignItems:"center", paddingVertical:16, borderBottomWidth:1 },
  reminderInfo:  { flex:1 },
  reminderMeal:  { fontSize:16, fontWeight:"500", marginBottom:4 },
  reminderTime:  { fontSize:14 },
  reminderNote:  { fontSize:12, textAlign:"center", marginTop:20, fontStyle:"italic" },
});