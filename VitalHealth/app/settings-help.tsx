import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import Header from "./components/Header";
import { useTheme } from "../context/ThemeContext";
import { useStackBackHandler } from "../hooks/useStackBackHandler";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type FAQ = {
  q: string;
  a: string;
  icon: string;
};

type Section = {
  label: string;
  faqs: FAQ[];
};

const SECTIONS: Section[] = [
  {
    label: "Getting Started",
    faqs: [
      {
        icon: "🚀",
        q: "How do I set up my digital twin?",
        a: "Open the Dashboard tab and tap 'Start Monitoring'. Grant the required health permissions and follow the 3-step onboarding. Your twin syncs automatically within 60 seconds.",
      },
      {
        icon: "📱",
        q: "Which devices does VitalHealth support?",
        a: "VitalHealth works with Apple Health, Google Fit, Fitbit, Garmin, Samsung Health, and most Bluetooth-enabled wearables. Go to Settings → Devices to connect.",
      },
      {
        icon: "🔗",
        q: "Can I connect multiple wearables?",
        a: "Yes — up to 5 devices simultaneously. Data is merged and deduplicated in real-time by your twin's AI model. Priority device can be set in Settings → Devices → Priority.",
      },
    ],
  },
  {
    label: "Health Data",
    faqs: [
      {
        icon: "❤️",
        q: "What vitals does VitalHealth track?",
        a: "Heart rate, SpO₂, HRV, respiratory rate, blood glucose (if sensor connected), sleep stages, hydration estimate, activity, stress index, and skin temperature.",
      },
      {
        icon: "📊",
        q: "How accurate are the AI health insights?",
        a: "Our models are validated at 94–98% accuracy across core vitals. Insights are informational and not a substitute for medical advice. Always consult a doctor for clinical decisions.",
      },
      {
        icon: "🕐",
        q: "How far back does health history go?",
        a: "Up to 24 months of history is stored securely. You can export any range as PDF or CSV from Reports → Export Data. Older data can be archived to cloud storage.",
      },
    ],
  },
  {
    label: "Privacy & Security",
    faqs: [
      {
        icon: "🔒",
        q: "Is my health data encrypted?",
        a: "All data is AES-256 encrypted at rest and in transit. Your twin model runs on-device — raw biometric data never leaves your phone unless you explicitly enable cloud sync.",
      },
      {
        icon: "☁️",
        q: "What does Health Cloud Sync share?",
        a: "Only the data categories you enable in Settings → Privacy → Cloud Sync. Each toggle controls exactly what is shared. You can revoke access at any time and your data is deleted within 48 hours.",
      },
      {
        icon: "🗑️",
        q: "How do I delete all my data?",
        a: "Go to Settings → Privacy → Delete My Data. This permanently removes all local and cloud data. This action cannot be undone. Your account will also be deactivated.",
      },
    ],
  },
  {
    label: "Notifications & Reminders",
    faqs: [
      {
        icon: "🔔",
        q: "How do I customize smart reminders?",
        a: "Navigate to Settings → Reminders. You can set medication schedules, hydration goals, symptom check-in times, and quiet hours. AI reminders adapt to your daily routine automatically.",
      },
      {
        icon: "🚨",
        q: "What triggers a critical vital alert?",
        a: "Heart rate above 180 bpm or below 40 bpm, or SpO₂ below 90%. You will receive a high-priority push notification advising you to check your vitals or consult a doctor.",
      },
    ],
  },
  {
    label: "Account & Billing",
    faqs: [
      {
        icon: "💳",
        q: "How do I manage my subscription?",
        a: "Go to Settings → Account → Subscription. You can upgrade, downgrade, or cancel at any time. Cancellations take effect at the end of your current billing period.",
      },
      {
        icon: "👨‍👩‍👧",
        q: "Can I share my plan with family?",
        a: "Yes — the Family Plan supports up to 6 members. Each gets a separate twin profile with independent privacy settings. Manage members in Settings → Account → Family.",
      },
    ],
  },
];

function AccordionItem({
  faq,
  c,
  isLast,
}: {
  faq: FAQ;
  c: ReturnType<typeof getColors>;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    LayoutAnimation.configureNext({
      duration: 240,
      create: { type: "easeInEaseOut", property: "opacity" },
      update: { type: "easeInEaseOut" },
    });
    Animated.timing(rotateAnim, {
      toValue: open ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
    setOpen((v) => !v);
  };

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });

  return (
    <View
      style={[
        styles.item,
        { borderBottomColor: c.border, borderBottomWidth: isLast ? 0 : 1 },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={toggle}
        style={styles.itemRow}
      >
        <View style={[styles.itemIcon, { backgroundColor: c.iconBg }]}>
          <Text style={{ fontSize: 15 }}>{faq.icon}</Text>
        </View>
        <Text style={[styles.itemQ, { color: c.text1, flex: 1 }]}>{faq.q}</Text>
        <Animated.Text
          style={[
            styles.arrow,
            { color: c.accent, transform: [{ rotate }] },
          ]}
        >
          ›
        </Animated.Text>
      </TouchableOpacity>

      {open && (
        <View style={[styles.answer, { backgroundColor: c.answerBg }]}>
          <View style={[styles.answerAccent, { backgroundColor: c.accent }]} />
          <Text style={[styles.answerText, { color: c.text2 }]}>{faq.a}</Text>
        </View>
      )}
    </View>
  );
}

function getColors(theme: string) {
  const dark = theme === "dark";
  return {
    bg: dark ? "#070f1a" : "#f0f9ff",
    card: dark ? "#0d1f35" : "#ffffff",
    border: dark ? "rgba(14,165,233,0.12)" : "rgba(14,165,233,0.15)",
    sectionBorder: dark ? "rgba(14,165,233,0.1)" : "rgba(14,165,233,0.12)",
    text1: dark ? "#e2f4ff" : "#0c2340",
    text2: dark ? "#7db8d4" : "#1e4d6b",
    text3: dark ? "#3d6e8a" : "#4a8fa8",
    accent: "#0ea5e9",
    iconBg: dark ? "rgba(14,165,233,0.12)" : "rgba(14,165,233,0.08)",
    answerBg: dark ? "rgba(14,165,233,0.05)" : "rgba(14,165,233,0.04)",
  };
}

export default function SettingsHelp() {
  useStackBackHandler();
  const router = useRouter();
  const { theme } = useTheme();
  const c = getColors(theme);

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <Header title="Help Center" showBack={true} showProfile={false} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── PAGE HEADER ── */}
        <View style={styles.pageHeader}>
          <View style={[styles.headerIcon, { backgroundColor: "rgba(14,165,233,0.1)" }]}>
            <Text style={{ fontSize: 22 }}>💬</Text>
          </View>
          <Text style={[styles.pageTitle, { color: c.text1 }]}>Help Center</Text>
          <Text style={[styles.pageSubtitle, { color: c.text2 }]}>
            Find answers to common questions about VitalHealth.
          </Text>
        </View>

        {/* ── SECTIONS ── */}
        {SECTIONS.map((section, si) => (
          <View key={si} style={styles.sectionWrap}>
            <Text style={[styles.sectionLabel, { color: c.text3 }]}>
              {section.label}
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: c.card, borderColor: c.sectionBorder },
              ]}
            >
              {section.faqs.map((faq, fi) => (
                <AccordionItem
                  key={fi}
                  faq={faq}
                  c={c}
                  isLast={fi === section.faqs.length - 1}
                />
              ))}
            </View>
          </View>
        ))}

        {/* ── CONTACT FOOTER ── */}
        <View style={[styles.contactCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={{ fontSize: 20, marginBottom: 8 }}>🩺</Text>
          <Text style={[styles.contactTitle, { color: c.text1 }]}>
            Found an issue or need help?
          </Text>
          <Text style={[styles.contactDesc, { color: c.text2 }]}>
            Submit a bug report or contact our team directly.
          </Text>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <TouchableOpacity
              style={[styles.contactBtn, { backgroundColor: "#ef4444" }]}
              activeOpacity={0.85}
              onPress={() => router.push("/report-bug" as any)}
            >
              <Text style={styles.contactBtnText}>🐛 Report Bug (Beta)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.contactBtn, { backgroundColor: c.accent }]}
              activeOpacity={0.85}
              onPress={() => Linking.openURL("mailto:vitalhealth1215@gmail.com")}
            >
              <Text style={styles.contactBtnText}>Contact Support →</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.version, { color: c.text3 }]}>
          VitalHealth v2.4.1 · vitalhealth1215@gmail.com
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingTop: 110, paddingHorizontal: 16, paddingBottom: 48 },

  pageHeader: { alignItems: "center", marginBottom: 28 },
  headerIcon: {
    width: 56, height: 56, borderRadius: 18,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  pageTitle: { fontSize: 24, fontWeight: "700", marginBottom: 6 },
  pageSubtitle: { fontSize: 13, textAlign: "center", lineHeight: 19, maxWidth: 280 },

  sectionWrap: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.6,
    textTransform: "uppercase", marginBottom: 8, marginLeft: 4,
  },
  card: {
    borderRadius: 16, borderWidth: 1, overflow: "hidden",
  },

  item: {},
  itemRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 14, gap: 12,
  },
  itemIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  itemQ: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  arrow: { fontSize: 22, fontWeight: "300", marginLeft: 4 },

  answer: {
    flexDirection: "row", marginHorizontal: 14,
    marginBottom: 14, borderRadius: 12, overflow: "hidden",
  },
  answerAccent: { width: 3, borderRadius: 2, marginRight: 0 },
  answerText: {
    flex: 1, fontSize: 13, lineHeight: 20,
    padding: 12, paddingLeft: 10,
  },

  contactCard: {
    borderRadius: 16, borderWidth: 1,
    padding: 20, alignItems: "center",
    marginBottom: 16,
  },
  contactTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  contactDesc: { fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 16 },
  contactBtn: {
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 24,
  },
  contactBtnText: { color: "white", fontWeight: "700", fontSize: 14 },

  version: { fontSize: 11, textAlign: "center", opacity: 0.6 },
});