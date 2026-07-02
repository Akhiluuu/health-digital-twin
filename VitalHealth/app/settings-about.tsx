import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import Header from "./components/Header";
import { useTheme } from "../context/ThemeContext";

const FEATURES = [
  {
    icon: "⚡",
    title: "Real-Time Monitoring",
    desc: "Continuous biometric tracking — heart rate, SpO₂, hydration, and activity synced live.",
    color: "#0ea5e9",
    bg: "rgba(14,165,233,0.1)",
  },
  {
    icon: "🤖",
    title: "AI Health Insights",
    desc: "Predictive analytics and personalized recommendations powered by your digital twin model.",
    color: "#14b8a6",
    bg: "rgba(20,184,166,0.1)",
  },
  {
    icon: "🔔",
    title: "Smart Reminders",
    desc: "Context-aware nudges for medication, hydration, symptoms, and wellness check-ins.",
    color: "#6366f1",
    bg: "rgba(99,102,241,0.1)",
  },
  {
    icon: "🔒",
    title: "Private by Design",
    desc: "End-to-end encrypted health data. Your twin lives on your device — never sold, never shared.",
    color: "#f43f5e",
    bg: "rgba(244,63,94,0.1)",
  },
];

const STATS = [
  { value: "98%", label: "Accuracy" },
  { value: "24/7", label: "Monitoring" },
  { value: "0ms", label: "Latency" },
];

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim, {
        toValue: 1,
        duration: 600,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 600,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: slide }] }}>
      {children}
    </Animated.View>
  );
}

export default function About() {
  const router = useRouter();
  const { theme } = useTheme();
  const dark = theme === "dark";

  const c = {
    bg: dark ? "#070f1a" : "#f0f9ff",
    bg2: dark ? "#0d1f35" : "#ffffff",
    bg3: dark ? "#0a1628" : "#e8f4fd",
    border: dark ? "rgba(14,165,233,0.15)" : "rgba(14,165,233,0.18)",
    text1: dark ? "#e2f4ff" : "#0c2340",
    text2: dark ? "#7db8d4" : "#1e4d6b",
    text3: dark ? "#4a7a96" : "#4a8fa8",
    accent: "#0ea5e9",
    teal: "#14b8a6",
  };

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <Header title="About VitalHealth" showBack={true} showProfile={false} />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO ─────────────────────────────── */}
        <FadeIn delay={0}>
          <View style={[s.heroBadge, { backgroundColor: "rgba(14,165,233,0.1)", borderColor: "rgba(14,165,233,0.25)" }]}>
            <View style={s.pulseDot} />
            <Text style={[s.badgeText, { color: c.accent }]}>AI · Health · Companion</Text>
          </View>
        </FadeIn>

        <FadeIn delay={80}>
          <Text style={[s.heroTitle, { color: c.text1 }]}>
            About{" "}
            <Text style={{ color: c.accent }}>VitalHealth</Text>
          </Text>
        </FadeIn>

        <FadeIn delay={160}>
          <Text style={[s.heroSub, { color: c.text2 }]}>
            We're building the world's most intelligent personal health companion — a living digital replica of you that understands, predicts, and protects your wellbeing around the clock.
          </Text>
        </FadeIn>

        {/* ── AVATAR CARD ─────────────────────── */}
        <FadeIn delay={220}>
          <View style={[s.avatarCard, { backgroundColor: c.bg2, borderColor: c.border }]}>
            {/* Decorative scan line */}
            <View style={s.avatarBg}>
              <View style={[s.scanLine, { backgroundColor: "rgba(14,165,233,0.08)" }]} />
              <View style={[s.scanLine, { top: 60, backgroundColor: "rgba(20,184,166,0.06)" }]} />
            </View>
            {/* Silhouette */}
            <View style={s.silhouette}>
              <View style={[s.siHead, { backgroundColor: "rgba(14,165,233,0.15)", borderColor: "rgba(14,165,233,0.3)" }]} />
              <View style={[s.siBody, { backgroundColor: "rgba(14,165,233,0.1)", borderColor: "rgba(14,165,233,0.2)" }]}>
                <View style={[s.siHeart, { borderColor: "rgba(244,63,94,0.4)", backgroundColor: "rgba(244,63,94,0.08)" }]}>
                  <Text style={{ fontSize: 12, color: "#f43f5e" }}>♥</Text>
                </View>
              </View>
            </View>
            {/* Floating chips */}
            <View style={[s.chip, s.chipLeft, { backgroundColor: c.bg2, borderColor: c.border }]}>
              <Text style={[s.chipText, { color: c.accent }]}>❤️ 72 bpm</Text>
            </View>
            <View style={[s.chip, s.chipRight, { backgroundColor: c.bg2, borderColor: c.border }]}>
              <Text style={[s.chipText, { color: c.teal }]}>🫁 98% SpO₂</Text>
            </View>
            <View style={[s.chip, s.chipBottom, { backgroundColor: c.bg2, borderColor: c.border }]}>
              <Text style={[s.chipText, { color: "#6366f1" }]}>⚡ 7.2k steps</Text>
            </View>
          </View>
        </FadeIn>

        {/* ── STATS ROW ────────────────────────── */}
        <FadeIn delay={280}>
          <View style={s.statsRow}>
            {STATS.map((st, i) => (
              <View key={i} style={[s.statBox, { backgroundColor: c.bg2, borderColor: c.border }]}>
                <Text style={[s.statValue, { color: c.accent }]}>{st.value}</Text>
                <Text style={[s.statLabel, { color: c.text3 }]}>{st.label}</Text>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* ── MISSION ──────────────────────────── */}
        <FadeIn delay={320}>
          <View style={[s.missionCard, { backgroundColor: "rgba(14,165,233,0.06)", borderColor: "rgba(14,165,233,0.18)" }]}>
            <Text style={[s.missionLabel, { color: c.accent }]}>Our Mission</Text>
            <Text style={[s.missionText, { color: c.text1 }]}>
              Proactive health monitoring, emergency intelligence, and human digital twins — for every person on the planet.
            </Text>
          </View>
        </FadeIn>

        {/* ── FEATURES ─────────────────────────── */}
        <Text style={[s.sectionHead, { color: c.text3 }]}>What we do</Text>
        {FEATURES.map((f, i) => (
          <FadeIn key={i} delay={360 + i * 60}>
            <View style={[s.featureCard, { backgroundColor: c.bg2, borderColor: c.border }]}>
              <View style={[s.featureIcon, { backgroundColor: f.bg }]}>
                <Text style={{ fontSize: 18 }}>{f.icon}</Text>
              </View>
              <View style={s.featureText}>
                <Text style={[s.featureTitle, { color: c.text1 }]}>{f.title}</Text>
                <Text style={[s.featureDesc, { color: c.text2 }]}>{f.desc}</Text>
              </View>
            </View>
          </FadeIn>
        ))}

        {/* ── TEAM NOTE ────────────────────────── */}
        <FadeIn delay={640}>
          <View style={[s.teamCard, { backgroundColor: c.bg2, borderColor: c.border }]}>
            <View style={s.teamAvatars}>
              {["A", "R", "K"].map((l, i) => (
                <View key={i} style={[s.teamAvatar, { marginLeft: i === 0 ? 0 : -10, backgroundColor: ["#0ea5e920", "#14b8a620", "#6366f120"][i], borderColor: ["#0ea5e9", "#14b8a6", "#6366f1"][i] }]}>
                  <Text style={[s.teamInitial, { color: ["#0ea5e9", "#14b8a6", "#6366f1"][i] }]}>{l}</Text>
                </View>
              ))}
            </View>
            <Text style={[s.teamTitle, { color: c.text1 }]}>Built with care</Text>
            <Text style={[s.teamDesc, { color: c.text2 }]}>
              A small team of doctors, engineers, and designers united by one belief: your health data should work for you, not against you.
            </Text>
          </View>
        </FadeIn>

        {/* ── CTA ──────────────────────────────── */}
        <FadeIn delay={700}>
          <TouchableOpacity
            style={s.ctaBtn}
            activeOpacity={0.85}
            onPress={() => router.replace("/(tabs)")}
          >
            <Text style={s.ctaBtnText}>Start Monitoring →</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.ctaBtnOutline, { borderColor: c.border }]}
            activeOpacity={0.85}
            onPress={() => Linking.openURL("mailto:vitalhealth1215@gmail.com")}
          >
            <Text style={[s.ctaBtnOutlineText, { color: c.accent }]}>Contact the team</Text>
          </TouchableOpacity>
        </FadeIn>

        {/* ── FOOTER ───────────────────────────── */}
        <FadeIn delay={740}>
          <View style={[s.footer, { borderTopColor: c.border }]}>
            <Text style={[s.footerBrand, { color: c.text1 }]}>⬡ VitalHealth</Text>
            <Text style={[s.footerSub, { color: c.text3 }]}>Your intelligent digital twin companion</Text>
            <Text style={[s.footerCopy, { color: c.text3 }]}>© 2026 VitalHealth · All rights reserved</Text>
          </View>
        </FadeIn>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingTop: 110, paddingHorizontal: 16, paddingBottom: 40 },

  /* Badge */
  heroBadge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, marginBottom: 14,
  },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#0ea5e9" },
  badgeText: { fontSize: 11, fontWeight: "600", letterSpacing: 0.4 },

  /* Hero text */
  heroTitle: { fontSize: 30, fontWeight: "700", lineHeight: 36, marginBottom: 10 },
  heroSub: { fontSize: 14, lineHeight: 22, marginBottom: 24 },

  /* Avatar card */
  avatarCard: {
    borderRadius: 20, borderWidth: 1, padding: 24,
    alignItems: "center", marginBottom: 16,
    overflow: "hidden", minHeight: 200, position: "relative",
  },
  avatarBg: { ...StyleSheet.absoluteFillObject },
  scanLine: { position: "absolute", left: 0, right: 0, height: 40, top: 20 },
  silhouette: { alignItems: "center", gap: 4, marginVertical: 12 },
  siHead: {
    width: 44, height: 50, borderRadius: 22,
    borderWidth: 1.5,
  },
  siBody: {
    width: 80, height: 90, borderRadius: 16,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
  },
  siHeart: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
  },
  chip: {
    position: "absolute", borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  chipLeft: { left: 8, top: "35%" },
  chipRight: { right: 8, top: "35%" },
  chipBottom: { bottom: 16 },
  chipText: { fontSize: 11, fontWeight: "600" },

  /* Stats */
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statBox: {
    flex: 1, borderRadius: 14, borderWidth: 1,
    padding: 14, alignItems: "center",
  },
  statValue: { fontSize: 20, fontWeight: "700" },
  statLabel: { fontSize: 11, marginTop: 2 },

  /* Mission */
  missionCard: {
    borderRadius: 16, borderWidth: 1,
    padding: 18, marginBottom: 20,
  },
  missionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 6, textTransform: "uppercase" },
  missionText: { fontSize: 15, fontWeight: "600", lineHeight: 22 },

  /* Section head */
  sectionHead: {
    fontSize: 11, fontWeight: "600", letterSpacing: 0.6,
    textTransform: "uppercase", marginBottom: 10,
  },

  /* Features */
  featureCard: {
    borderRadius: 16, borderWidth: 1,
    padding: 16, flexDirection: "row",
    alignItems: "flex-start", gap: 14, marginBottom: 10,
  },
  featureIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  featureDesc: { fontSize: 12, lineHeight: 18 },

  /* Team */
  teamCard: {
    borderRadius: 16, borderWidth: 1,
    padding: 18, marginTop: 6, marginBottom: 20, alignItems: "center",
  },
  teamAvatars: { flexDirection: "row", marginBottom: 12 },
  teamAvatar: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, alignItems: "center", justifyContent: "center",
  },
  teamInitial: { fontSize: 13, fontWeight: "700" },
  teamTitle: { fontSize: 15, fontWeight: "700", marginBottom: 6 },
  teamDesc: { fontSize: 13, lineHeight: 19, textAlign: "center" },

  /* CTAs */
  ctaBtn: {
    backgroundColor: "#0ea5e9",
    borderRadius: 28, paddingVertical: 14,
    alignItems: "center", marginBottom: 10,
  },
  ctaBtnText: { color: "white", fontSize: 15, fontWeight: "700" },
  ctaBtnOutline: {
    borderWidth: 1.5, borderRadius: 28, paddingVertical: 13,
    alignItems: "center", marginBottom: 28,
  },
  ctaBtnOutlineText: { fontSize: 14, fontWeight: "600" },

  /* Footer */
  footer: { borderTopWidth: 1, paddingTop: 20, alignItems: "center", gap: 4 },
  footerBrand: { fontSize: 16, fontWeight: "700" },
  footerSub: { fontSize: 12 },
  footerCopy: { fontSize: 10, marginTop: 4, opacity: 0.7 },
});