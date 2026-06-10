// context/useThemeColors.ts
import { useTheme } from "./ThemeContext";
import { colors } from "../theme/colors";

export function useThemeColors() {
  const { theme } = useTheme();
  const c = colors[theme];

  return {
    bg: c.bg,
    card: c.card,
    text: c.text,
    border: c.border,
    secondaryText: c.sub,
    accent: c.accent,
    active: c.active,
    danger: c.danger,
  };
}
