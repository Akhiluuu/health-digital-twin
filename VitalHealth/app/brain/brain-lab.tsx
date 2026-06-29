// app/brain/brain-lab.tsx
import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Dimensions,
  Animated,
  Switch,
  Modal,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { useTheme } from "../../context/ThemeContext";
import { useCognitive, CognitiveTestResult, CognitiveSession } from "../../context/CognitiveContext";
import { useProfile } from "../../context/ProfileContext";
import { useBiogearsTwin } from "../../context/BiogearsTwinContext";
import { getGrade, GameResult, buildReport } from "./brainEngine";

// Import all 10 tests
import PatternTest from "./PatternTest";
import ReactionTest from "./ReactionTest";
import MemoryTest from "./MemoryTest";
import StroopTest from "./StroopTest";
import ContinuousPerformanceTest from "./ContinuousPerformanceTest";
import FlankerTest from "./FlankerTest";
import NBackTest from "./NBackTest";
import SymbolMatchTest from "./SymbolMatchTest";
import TrailMakingTest from "./TrailMakingTest";
import TaskSwitchingTest from "./TaskSwitchingTest";

const { width: W } = Dimensions.get("window");

type ScreenState =
  | "dashboard"
  | "choose_domain"
  | "select_test"
  | "test_instructions"
  | "calibration"
  | "playing_test"
  | "test_results"
  | "assessment_flow"
  | "full_report";

const DOMAINS = {
  attention: {
    title: "Attention",
    science: "Inhibitory & Selective Focus",
    color: "#6366f1",
    icon: "🎯",
    tests: [
      { id: "stroop", name: "Stroop Focus", desc: "Measures interference control and focus inhibition." },
      { id: "cpt", name: "Sustained Attention", desc: "A-X Continuous Performance Test of focus endurance." },
      { id: "flanker", name: "Selective Focus", desc: "Flanker task ignoring visual side distractors." },
    ],
  },
  memory: {
    title: "Memory",
    science: "Working Memory Capacity",
    color: "#a855f7",
    icon: "🧩",
    tests: [
      { id: "pattern", name: "Pattern Recall", desc: "Grid-based visuospatial sequence memory." },
      { id: "memory", name: "Working Memory", desc: "Numerical sequence span test." },
      { id: "nback", name: "N-Back Recall", desc: "2-Back working memory retrieval task." },
    ],
  },
  processingSpeed: {
    title: "Processing Speed",
    science: "Neural Response Time",
    color: "#0ea5e9",
    icon: "⚡",
    tests: [
      { id: "reaction", name: "Reaction Speed", desc: "Visual stimulus reaction speed test." },
      { id: "symbol", name: "Symbol Matching", desc: "Digit symbol substitution visual search speed." },
    ],
  },
  executiveFunction: {
    title: "Executive Function",
    science: "Cognitive set-shifting",
    color: "#ec4899",
    icon: "🔀",
    tests: [
      { id: "trail", name: "Trail Making", desc: "Part A & B set shifting connect the dots." },
      { id: "switching", name: "Task Switching", desc: "Alternating verbal and numerical categorization." },
    ],
  },
};

const getDomainIcon = (key: string, size = 24, color = "#6366f1") => {
  switch (key) {
    case "attention":
      return <Ionicons name="eye" size={size} color={color} />;
    case "memory":
      return <MaterialCommunityIcons name="brain" size={size} color={color} />;
    case "processingSpeed":
      return <Ionicons name="flash" size={size} color={color} />;
    case "executiveFunction":
      return <Ionicons name="shuffle" size={size} color={color} />;
    default:
      return <Ionicons name="help-circle" size={size} color={color} />;
  }
};

const getAchievementColor = (id: string) => {
  switch (id) {
    case "first_test": return "#6366f1";
    case "memory_master": return "#a855f7";
    case "speed_demon": return "#0ea5e9";
    case "focus_champion": return "#3b82f6";
    case "flexible_thinker": return "#ec4899";
    case "streak_3": return "#f97316";
    case "streak_7": return "#eab308";
    case "perfect_score": return "#ef4444";
    default: return "#6366f1";
  }
};

const getAchievementIcon = (id: string, size = 24, isUnlocked = false, activeColor = "#6366f1") => {
  const color = isUnlocked ? activeColor : "#64748b";
  switch (id) {
    case "first_test":
      return <MaterialCommunityIcons name="brain" size={size} color={color} />;
    case "memory_master":
      return <MaterialCommunityIcons name="puzzle" size={size} color={color} />;
    case "speed_demon":
      return <Ionicons name="flash" size={size} color={color} />;
    case "focus_champion":
      return <Ionicons name="eye" size={size} color={color} />;
    case "flexible_thinker":
      return <Ionicons name="shuffle" size={size} color={color} />;
    case "streak_3":
      return <Ionicons name="flame" size={size} color={color} />;
    case "streak_7":
      return <Ionicons name="trophy" size={size} color={color} />;
    case "perfect_score":
      return <Ionicons name="ribbon" size={size} color={color} />;
    default:
      return <Ionicons name="award" size={size} color={color} />;
  }
};

const ASSESSMENT_STEPS = ["pattern", "reaction", "memory", "stroop"];

export default function BrainLab() {
  const router = useRouter();
  const { theme } = useTheme();
  const { profile } = useProfile();
  const { lastVitals } = useBiogearsTwin();
  
  const {
    sessions,
    isLoading,
    currentStreak,
    longestStreak,
    cognitiveAge,
    accessibilitySettings,
    achievements,
    updateAccessibility,
    saveSession,
    getDomainTrends,
    getHealthCorrelations,
    triggerHaptic,
  } = useCognitive();

  const isDark = theme === "dark";
  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    card2: isDark ? "#1e293b" : "#f1f5f9",
    text: isDark ? "#ffffff" : "#020617",
    subText: isDark ? "#94a3b8" : "#475569",
    subText2: isDark ? "#64748b" : "#64748b",
    border: isDark ? "#1e293b" : "#e2e8f0",
    border2: isDark ? "#334155" : "#cbd5e1",
    accent: "#6366f1",
    success: "#22c55e",
    error: "#ef4444",
  };

  const [screenState, setScreenState] = useState<ScreenState>("dashboard");
  const [selectedDomain, setSelectedDomain] = useState<keyof typeof DOMAINS>("attention");
  const [selectedTestId, setSelectedTestId] = useState<string>("stroop");
  const [calibrationCountdown, setCalibrationCountdown] = useState(3);
  
  // Game running state
  const [activeTestResults, setActiveTestResults] = useState<GameResult[]>([]);
  const [singleTestResult, setSingleTestResult] = useState<GameResult | null>(null);
  const [assessmentIndex, setAssessmentIndex] = useState(0);
  const [fullReportData, setFullReportData] = useState<any>(null);
  
  // Modals / Settings
  const [showSettings, setShowSettings] = useState(false);
  const [chartTab, setChartTab] = useState<"week" | "month">("week");

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const transitionState = (nextState: ScreenState, action?: () => void) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
    setTimeout(() => {
      setScreenState(nextState);
      if (action) action();
    }, 150);
  };

  // Calibration effect
  useEffect(() => {
    if (screenState !== "calibration") return;
    if (calibrationCountdown === 0) {
      setScreenState("playing_test");
      setCalibrationCountdown(3);
      return;
    }
    const t = setTimeout(() => {
      setCalibrationCountdown((c) => c - 1);
      triggerHaptic("light");
    }, 1000);
    return () => clearTimeout(t);
  }, [calibrationCountdown, screenState]);

  // Handle individual test completion
  const handleSingleTestDone = async (result: GameResult) => {
    triggerHaptic("success");
    setSingleTestResult(result);
    
    // Save to context by updating domain averages
    const currentDomainKey = Object.keys(DOMAINS).find((k) =>
      DOMAINS[k as keyof typeof DOMAINS].tests.some((t) => t.id === result.game)
    ) as keyof typeof DOMAINS;

    const domainScores = sessions.length > 0 
      ? { ...sessions[0].domainScores } 
      : { attention: 75, memory: 75, processingSpeed: 75, executiveFunction: 75 };

    domainScores[currentDomainKey] = result.score;
    const overallScore = Math.round(
      (domainScores.attention +
        domainScores.memory +
        domainScores.processingSpeed +
        domainScores.executiveFunction) /
        4
    );

    const testResultItem: CognitiveTestResult = {
      name: result.label,
      domain: currentDomainKey,
      score: result.score,
      accuracy: result.accuracy,
      responseTime: result.avgTimeMs,
    };

    await saveSession(overallScore, domainScores, [testResultItem]);
    transitionState("test_results");
  };

  // Handle full assessment step completion
  const handleAssessmentStepDone = (result: GameResult) => {
    const updatedResults = [...activeTestResults, result];
    setActiveTestResults(updatedResults);

    const nextIndex = assessmentIndex + 1;
    if (nextIndex < ASSESSMENT_STEPS.length) {
      setAssessmentIndex(nextIndex);
      const nextTest = ASSESSMENT_STEPS[nextIndex];
      setSelectedTestId(nextTest);
      transitionState("calibration");
    } else {
      // Calculate overall assessment scores
      const domainScores = {
        attention: Math.round((updatedResults.find((r) => r.game === "stroop")?.score || 75)),
        memory: Math.round(
          ((updatedResults.find((r) => r.game === "pattern")?.score || 75) +
            (updatedResults.find((r) => r.game === "memory")?.score || 75)) /
            2
        ),
        processingSpeed: Math.round((updatedResults.find((r) => r.game === "reaction")?.score || 75)),
        executiveFunction: Math.round((updatedResults.find((r) => r.game === "stroop")?.score || 75)), // Stroop maps also to EF
      };

      const overallScore = Math.round(
        (domainScores.attention +
          domainScores.memory +
          domainScores.processingSpeed +
          domainScores.executiveFunction) /
          4
      );

      const mappedResults: CognitiveTestResult[] = updatedResults.map((r) => ({
        name: r.label,
        domain: r.game === "stroop" ? "attention" : r.game === "reaction" ? "processingSpeed" : "memory",
        score: r.score,
        accuracy: r.accuracy,
        responseTime: r.avgTimeMs,
      }));

      saveSession(overallScore, domainScores, mappedResults).then((savedSession) => {
        const report = buildReport(updatedResults);
        setFullReportData(report);
        transitionState("full_report");
      });
    }
  };

  const startFullAssessment = () => {
    setActiveTestResults([]);
    setAssessmentIndex(0);
    setSelectedTestId(ASSESSMENT_STEPS[0]);
    transitionState("calibration");
  };

  // ── Header Component ──
  const Header = ({ title, showBack = true }: { title: string; showBack?: boolean }) => (
    <View style={[styles.header, { backgroundColor: colors.card }]}>
      {showBack ? (
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.card2 }]}
          onPress={() => {
            if (screenState === "dashboard") {
              router.back();
            } else if (screenState === "choose_domain") {
              transitionState("dashboard");
            } else if (screenState === "select_test") {
              transitionState("choose_domain");
            } else if (screenState === "test_instructions") {
              transitionState("select_test");
            } else {
              transitionState("dashboard");
            }
          }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.subText} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 40 }} />
      )}
      <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
      <TouchableOpacity
        style={[styles.settingsBtn, { backgroundColor: colors.card2 }]}
        onPress={() => setShowSettings(true)}
      >
        <Ionicons name="accessibility" size={20} color={colors.accent} />
      </TouchableOpacity>
    </View>
  );

  // ── Render Dynamic Chart ──
  const renderChart = () => {
    const data = chartTab === "week" ? sessions.slice(0, 7).reverse() : sessions.slice(0, 15).reverse();
    const maxVal = 100;
    
    if (data.length === 0) {
      return (
        <View style={[styles.chartContainer, styles.center, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.chartFallbackText, { color: colors.subText }]}>
            No historical data available. Complete an assessment to see trends.
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.chartContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.chartBarWrapper}>
          {data.map((s, idx) => {
            const heightPct = (s.overallScore / maxVal) * 100;
            const barDate = new Date(s.completedAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
            });
            return (
              <View key={s.id} style={styles.chartColumn}>
                <View style={[styles.chartBarTrack, { backgroundColor: colors.card2 }]}>
                  <View
                    style={[
                      styles.chartBarFill,
                      { height: `${heightPct}%`, backgroundColor: colors.accent },
                    ]}
                  />
                </View>
                <Text style={[styles.chartDate, { color: colors.subText }]} numberOfLines={1}>
                  {barDate}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // ── Dashboard View ──
  const renderDashboard = () => {
    const latestSession = sessions[0];
    const trends = getDomainTrends();
    const correlations = getHealthCorrelations();
    const gradeDetails = latestSession ? getGrade(latestSession.overallScore) : null;

    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Streak banner */}
        {currentStreak > 0 && (
          <LinearGradient colors={["#f59e0b", "#d97706"]} style={styles.streakBanner}>
            <Ionicons name="flame" size={24} color="#ffffff" />
            <Text style={styles.streakText}>
              {currentStreak} DAY STREAK! Longest streak is {longestStreak} days.
            </Text>
          </LinearGradient>
        )}

        {/* Overall Score / Digital Twin Card */}
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={[styles.heroTitle, { color: colors.text }]}>Cognitive Status</Text>
              <Text style={[styles.heroSub, { color: colors.subText }]}>Digital Twin Analysis</Text>
            </View>
            {gradeDetails && (
              <View style={[styles.heroGradePill, { backgroundColor: gradeDetails.color + "15", borderColor: gradeDetails.color }]}>
                <Text style={[styles.heroGradeText, { color: gradeDetails.color }]}>
                  {gradeDetails.label}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.heroBody}>
            <View style={styles.scoreCircle}>
              <Text style={[styles.scoreValue, { color: colors.accent }]}>
                {latestSession ? latestSession.overallScore : "--"}
              </Text>
              <Text style={[styles.scoreLabel, { color: colors.subText }]}>Score</Text>
            </View>

            <View style={styles.ageStats}>
              <Text style={[styles.ageValue, { color: colors.text }]}>{cognitiveAge} yrs</Text>
              <Text style={[styles.ageLabel, { color: colors.subText }]}>Cognitive Age</Text>
              <Text style={[styles.ageComparison, { color: colors.success }]}>
                {latestSession 
                  ? (cognitiveAge < (profile?.dateOfBirth ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / 31557600000) : 30)
                      ? " younger than biological age" 
                      : " aligned with biological age")
                  : "Calibration required"}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.heroButton} onPress={startFullAssessment}>
            <LinearGradient
              colors={["#4f46e5", "#6366f1"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.heroBtnGrad}
            >
              <Text style={styles.heroBtnText}>START DAILY ASSESSMENT</Text>
              <Ionicons name="arrow-forward" size={16} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* 4 Cognitive Domains Grid */}
        <Text style={[styles.sectionTitle, { color: colors.subText }]}>COGNITIVE DOMAINS</Text>
        <View style={styles.domainsGrid}>
          {Object.keys(DOMAINS).map((key) => {
            const dom = DOMAINS[key as keyof typeof DOMAINS];
            const trend = trends[key as keyof typeof DOMAINS];
            return (
              <TouchableOpacity
                key={key}
                style={[styles.domainCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  setSelectedDomain(key as any);
                  transitionState("select_test");
                }}
              >
                <View style={styles.domainTop}>
                  <View style={[styles.domainIconWrap, { backgroundColor: dom.color + "15" }]}>
                    {getDomainIcon(key, 20, dom.color)}
                  </View>
                  {trend.change !== 0 && (
                    <Text style={[styles.domainTrend, { color: trend.change > 0 ? colors.success : colors.error }]}>
                      {trend.change > 0 ? `+${trend.change}%` : `${trend.change}%`}
                    </Text>
                  )}
                </View>
                <Text style={[styles.domainName, { color: colors.text }]}>{dom.title}</Text>
                <Text style={[styles.domainScience, { color: colors.subText2 }]} numberOfLines={1}>
                  {dom.science}
                </Text>
                <View style={styles.domainFooter}>
                  <Text style={[styles.domainScore, { color: dom.color }]}>{Math.round(trend.current)}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.subText2} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Historical Charts */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.subText }]}>COGNITIVE TIMELINE</Text>
          <View style={styles.tabButtons}>
            <TouchableOpacity onPress={() => setChartTab("week")} style={[styles.tabBtn, chartTab === "week" && styles.activeTabBtn]}>
              <Text style={[styles.tabBtnText, { color: chartTab === "week" ? colors.accent : colors.subText }]}>Week</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setChartTab("month")} style={[styles.tabBtn, chartTab === "month" && styles.activeTabBtn]}>
              <Text style={[styles.tabBtnText, { color: chartTab === "month" ? colors.accent : colors.subText }]}>Month</Text>
            </TouchableOpacity>
          </View>
        </View>
        {renderChart()}

        {/* Achievements Gallery */}
        <Text style={[styles.sectionTitle, { color: colors.subText }]}>REWARDS & BADGES</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgesScroll}>
          {achievements.map((a) => {
            const isUnlocked = !!a.unlockedAt;
            return (
              <View
                key={a.id}
                style={[
                  styles.badgeCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  !isUnlocked && { opacity: 0.4 },
                ]}
              >
                <View style={[styles.badgeIconWrap, { backgroundColor: isUnlocked ? getAchievementColor(a.id) + "20" : colors.card2 }]}>
                  {getAchievementIcon(a.id, 24, isUnlocked, getAchievementColor(a.id))}
                </View>
                <Text style={[styles.badgeTitle, { color: colors.text }]} numberOfLines={1}>
                  {a.title}
                </Text>
                <Text style={[styles.badgeDesc, { color: colors.subText }]} numberOfLines={2}>
                  {a.description}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Digital Twin AI Recommendations */}
        <Text style={[styles.sectionTitle, { color: colors.subText }]}>TWIN CORRELATION ANALYSIS</Text>
        <View style={[styles.aiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.aiHeader}>
            <Ionicons name="analytics" size={22} color={colors.accent} />
            <Text style={[styles.aiTitle, { color: colors.text }]}>AI Correlation Engine</Text>
          </View>

          <View style={styles.correlationsGrid}>
            <View style={[styles.corrItem, { backgroundColor: colors.card2 }]}>
              <Text style={[styles.corrLabel, { color: colors.subText }]}>Sleep vs Cognition</Text>
              <Text style={[styles.corrVal, { color: correlations.sleepVsCognition > 0.4 ? colors.success : colors.accent }]}>
                {Math.round(correlations.sleepVsCognition * 100)}%
              </Text>
            </View>
            <View style={[styles.corrItem, { backgroundColor: colors.card2 }]}>
              <Text style={[styles.corrLabel, { color: colors.subText }]}>Steps vs Cognition</Text>
              <Text style={[styles.corrVal, { color: correlations.activityVsCognition > 0.4 ? colors.success : colors.accent }]}>
                {Math.round(correlations.activityVsCognition * 100)}%
              </Text>
            </View>
            <View style={[styles.corrItem, { backgroundColor: colors.card2 }]}>
              <Text style={[styles.corrLabel, { color: colors.subText }]}>Stress vs Focus</Text>
              <Text style={[styles.corrVal, { color: correlations.stressVsCognition < -0.4 ? colors.error : colors.accent }]}>
                {Math.round(correlations.stressVsCognition * 100)}%
              </Text>
            </View>
          </View>

          <View style={styles.aiInsightsList}>
            {correlations.insights.map((insight, idx) => (
              <View key={idx} style={styles.insightRow}>
                <Ionicons name="bulb" size={18} color="#eab308" style={styles.insightIcon} />
                <Text style={[styles.insightText, { color: colors.subText }]}>{insight}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.practiceBtn, { backgroundColor: colors.card2 }]}
          onPress={() => transitionState("choose_domain")}
        >
          <Ionicons name="game-controller" size={18} color={colors.accent} />
          <Text style={[styles.practiceBtnText, { color: colors.text }]}>Practice Individual Games</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  // ── Domain Selection View ──
  const renderChooseDomain = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: colors.text, marginTop: 12 }]}>Practice by Domain</Text>
        <Text style={[styles.subtitle, { color: colors.subText }]}>Select a cognitive category to sharpen your skills.</Text>

        {Object.keys(DOMAINS).map((key) => {
          const dom = DOMAINS[key as keyof typeof DOMAINS];
          return (
            <TouchableOpacity
              key={key}
              style={[styles.bigDomainCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                setSelectedDomain(key as any);
                transitionState("select_test");
              }}
            >
              <View style={[styles.bigDomainIconWrap, { backgroundColor: dom.color + "15" }]}>
                {getDomainIcon(key, 32, dom.color)}
              </View>
              <View style={styles.bigDomainBody}>
                <Text style={[styles.bigDomainTitle, { color: colors.text }]}>{dom.title}</Text>
                <Text style={[styles.bigDomainScience, { color: dom.color }]}>{dom.science}</Text>
                <Text style={[styles.bigDomainDesc, { color: colors.subText }]}>
                  Includes {dom.tests.length} specialized tests.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.subText2} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  // ── Test List Selector View ──
  const renderSelectTest = () => {
    const domain = DOMAINS[selectedDomain];
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: colors.text, marginTop: 12 }]}>{domain.title} Games</Text>
        <Text style={[styles.subtitle, { color: colors.subText }]}>{domain.science}</Text>

        {domain.tests.map((test) => (
          <TouchableOpacity
            key={test.id}
            style={[styles.testRowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              setSelectedTestId(test.id);
              transitionState("test_instructions");
            }}
          >
            <View style={styles.testRowHeader}>
              <Text style={[styles.testRowName, { color: colors.text }]}>{test.name}</Text>
              <Ionicons name="play" size={18} color={domain.color} />
            </View>
            <Text style={[styles.testRowDesc, { color: colors.subText }]}>{test.desc}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  // ── Render Active Game ──
  const renderPlayingTest = () => {
    const handleDoneCallback = (result: GameResult) => {
      if (screenState === "playing_test" && activeTestResults.length > 0) {
        handleAssessmentStepDone(result);
      } else {
        handleSingleTestDone(result);
      }
    };

    switch (selectedTestId) {
      case "pattern":
        return <PatternTest onDone={handleDoneCallback} />;
      case "reaction":
        return <ReactionTest onDone={handleDoneCallback} />;
      case "memory":
        return <MemoryTest onDone={handleDoneCallback} />;
      case "stroop":
        return <StroopTest onDone={handleDoneCallback} />;
      case "cpt":
        return <ContinuousPerformanceTest onDone={handleDoneCallback} />;
      case "flanker":
        return <FlankerTest onDone={handleDoneCallback} />;
      case "nback":
        return <NBackTest onDone={handleDoneCallback} />;
      case "symbol":
        return <SymbolMatchTest onDone={handleDoneCallback} />;
      case "trail":
        return <TrailMakingTest onDone={handleDoneCallback} />;
      case "switching":
        return <TaskSwitchingTest onDone={handleDoneCallback} />;
      default:
        return null;
    }
  };

  // ── Render Single Test Results ──
  const renderTestResults = () => {
    if (!singleTestResult) return null;
    const grade = getGrade(singleTestResult.score);
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <View style={[styles.resultsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.resultsIconWrap, { backgroundColor: "#eab30820" }]}>
            <Ionicons name="trophy" size={54} color="#eab308" />
          </View>
          <Text style={[styles.resultsTitle, { color: colors.text }]}>{singleTestResult.label} Results</Text>
          
          <View style={[styles.resultsScoreBadge, { backgroundColor: grade.color + "15" }]}>
            <Text style={[styles.resultsScoreText, { color: grade.color }]}>{singleTestResult.score}</Text>
            <Text style={[styles.resultsGradeLabel, { color: grade.color }]}>{grade.label}</Text>
          </View>

          <View style={styles.resultsStatsRow}>
            <View style={styles.resultsStatCol}>
              <Text style={[styles.resultsStatVal, { color: colors.text }]}>
                {Math.round(singleTestResult.accuracy * 100)}%
              </Text>
              <Text style={[styles.resultsStatLabel, { color: colors.subText }]}>Accuracy</Text>
            </View>
            <View style={styles.resultsStatCol}>
              <Text style={[styles.resultsStatVal, { color: colors.text }]}>
                {Math.round(singleTestResult.avgTimeMs)}ms
              </Text>
              <Text style={[styles.resultsStatLabel, { color: colors.subText }]}>Response Time</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.resultsFinishBtn, { backgroundColor: colors.accent }]}
            onPress={() => transitionState("dashboard")}
          >
            <Text style={styles.resultsFinishBtnText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Render Full Report ──
  const renderFullReport = () => {
    if (!fullReportData) return null;
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[fullReportData.gradeColor + "15", colors.card]} style={styles.reportHeroCard}>
          <Text style={[styles.reportGradeVal, { color: fullReportData.gradeColor }]}>{fullReportData.grade}</Text>
          <Text style={[styles.reportScoreVal, { color: colors.text }]}>{fullReportData.overallScore}</Text>
          <Text style={[styles.reportScoreLbl, { color: colors.subText }]}>OVERALL COGNITIVE SCORE</Text>
        </LinearGradient>

        <View style={[styles.reportInsightCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="bulb" size={22} color="#eab308" />
          <Text style={[styles.reportInsightText, { color: colors.text }]}>{fullReportData.insight}</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.subText }]}>TEST BREAKDOWN</Text>
        {fullReportData.results.map((r: any) => {
          const gr = getGrade(r.score);
          return (
            <View key={r.game} style={[styles.reportBreakdownRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.reportBreakdownHeader}>
                <Text style={[styles.reportBreakdownLabel, { color: colors.text }]}>{r.label}</Text>
                <Text style={[styles.reportBreakdownScore, { color: gr.color }]}>{r.score}</Text>
              </View>
              <View style={styles.reportBreakdownBarTrack}>
                <View style={[styles.reportBreakdownBarFill, { width: `${r.score}%`, backgroundColor: gr.color }]} />
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.resultsFinishBtn, { backgroundColor: colors.accent, marginTop: 24 }]}
          onPress={() => transitionState("dashboard")}
        >
          <Text style={styles.resultsFinishBtnText}>Return to Dashboard</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {screenState === "dashboard" && <Header title="COGNITIVE HEALTH" showBack={true} />}
      {screenState === "choose_domain" && <Header title="CATEGORIES" showBack={true} />}
      {screenState === "select_test" && <Header title="SELECT GAME" showBack={true} />}
      {screenState === "test_instructions" && <Header title="INSTRUCTIONS" showBack={true} />}
      
      <Animated.View style={[styles.body, { opacity: fadeAnim }]}>
        {screenState === "dashboard" && renderDashboard()}
        {screenState === "choose_domain" && renderChooseDomain()}
        {screenState === "select_test" && renderSelectTest()}
        
        {screenState === "test_instructions" && (
          <View style={[styles.container, { backgroundColor: colors.background }]}>
            {selectedTestId === "pattern" && <PatternTest onDone={handleSingleTestDone} />}
            {selectedTestId === "reaction" && <ReactionTest onDone={handleSingleTestDone} />}
            {selectedTestId === "memory" && <MemoryTest onDone={handleSingleTestDone} />}
            {selectedTestId === "stroop" && <StroopTest onDone={handleSingleTestDone} />}
            {selectedTestId === "cpt" && <ContinuousPerformanceTest onDone={handleSingleTestDone} />}
            {selectedTestId === "flanker" && <FlankerTest onDone={handleSingleTestDone} />}
            {selectedTestId === "nback" && <NBackTest onDone={handleSingleTestDone} />}
            {selectedTestId === "symbol" && <SymbolMatchTest onDone={handleSingleTestDone} />}
            {selectedTestId === "trail" && <TrailMakingTest onDone={handleSingleTestDone} />}
            {selectedTestId === "switching" && <TaskSwitchingTest onDone={handleSingleTestDone} />}
          </View>
        )}

        {screenState === "calibration" && (
          <View style={[styles.container, styles.center]}>
            <Text style={[styles.countdownText, { color: colors.accent }]}>{calibrationCountdown}</Text>
            <Text style={[styles.subText, { color: colors.subText }]}>Get Ready...</Text>
          </View>
        )}

        {screenState === "playing_test" && renderPlayingTest()}
        {screenState === "test_results" && renderTestResults()}
        {screenState === "full_report" && renderFullReport()}
      </Animated.View>

      {/* Accessibility settings Overlay */}
      <Modal visible={showSettings} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Accessibility Settings</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.settingRow}>
              <View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Large Text Size</Text>
                <Text style={[styles.settingDesc, { color: colors.subText }]}>Increases test screen font sizes.</Text>
              </View>
              <Switch
                value={accessibilitySettings.largeText}
                onValueChange={(v) => updateAccessibility({ largeText: v })}
                trackColor={{ true: colors.accent }}
              />
            </View>

            <View style={styles.settingRow}>
              <View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Color-blind Contrast Mode</Text>
                <Text style={[styles.settingDesc, { color: colors.subText }]}>High contrast colors for visual tests.</Text>
              </View>
              <Switch
                value={accessibilitySettings.colorBlindMode}
                onValueChange={(v) => updateAccessibility({ colorBlindMode: v })}
                trackColor={{ true: colors.accent }}
              />
            </View>

            <View style={styles.settingRow}>
              <View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Haptic Guidance</Text>
                <Text style={[styles.settingDesc, { color: colors.subText }]}>Reinforces response triggers physically.</Text>
              </View>
              <Switch
                value={accessibilitySettings.voiceGuidance}
                onValueChange={(v) => updateAccessibility({ voiceGuidance: v })}
                trackColor={{ true: colors.accent }}
              />
            </View>

            <TouchableOpacity style={[styles.resultsFinishBtn, { backgroundColor: colors.accent }]} onPress={() => setShowSettings(false)}>
              <Text style={styles.resultsFinishBtnText}>Save Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1 },
  center: { justifyContent: "center", alignItems: "center" },
  header: { paddingTop: 54, paddingBottom: 16, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "rgba(100,116,139,0.08)" },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontWeight: "900", fontSize: 13, letterSpacing: 2, textTransform: "uppercase" },
  settingsBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  scrollContent: { padding: 20 },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: { fontSize: 13, fontWeight: "600", marginTop: 4, marginBottom: 20 },
  sectionTitle: { fontSize: 10, fontWeight: "900", letterSpacing: 2, textTransform: "uppercase", marginTop: 24, marginBottom: 12 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 12 },
  
  streakBanner: { flexDirection: "row", alignItems: "center", borderRadius: 20, padding: 16, marginBottom: 20, gap: 12 },
  streakText: { color: "#ffffff", fontWeight: "900", fontSize: 14 },
  
  heroCard: { borderRadius: 28, padding: 24, borderWidth: 1, elevation: 4, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, marginBottom: 16 },
  heroHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  heroTitle: { fontSize: 18, fontWeight: "900" },
  heroSub: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  heroGradePill: { borderStyle: "solid", borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4 },
  heroGradeText: { fontSize: 11, fontWeight: "700" },
  heroBody: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginBottom: 24 },
  scoreCircle: { width: 90, height: 90, borderRadius: 45, borderStyle: "dashed", borderWidth: 2, borderColor: "#6366f1", justifyContent: "center", alignItems: "center" },
  scoreValue: { fontSize: 32, fontWeight: "900" },
  scoreLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  ageStats: { alignItems: "center" },
  ageValue: { fontSize: 28, fontWeight: "900" },
  ageLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 },
  ageComparison: { fontSize: 11, fontWeight: "600", marginTop: 4 },
  heroButton: { borderRadius: 20, overflow: "hidden" },
  heroBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, gap: 10 },
  heroBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "900", letterSpacing: 1 },

  domainsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  domainCard: { width: (W - 52) / 2, borderRadius: 24, padding: 16, borderWidth: 1 },
  domainTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  domainIconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  domainTrend: { fontSize: 11, fontWeight: "700" },
  domainName: { fontSize: 14, fontWeight: "800" },
  domainScience: { fontSize: 10, marginTop: 2, fontWeight: "500" },
  domainFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  domainScore: { fontSize: 18, fontWeight: "900" },

  chartContainer: { borderRadius: 24, padding: 16, borderWidth: 1, height: 160, justifyContent: "flex-end" },
  chartBarWrapper: { flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end", flex: 1, width: "100%" },
  chartColumn: { alignItems: "center", flex: 1 },
  chartBarTrack: { height: 100, width: 8, borderRadius: 4, justifyContent: "flex-end", overflow: "hidden" },
  chartBarFill: { width: "100%", borderRadius: 4 },
  chartDate: { fontSize: 9, fontWeight: "700", marginTop: 8, textAlign: "center" },
  chartFallbackText: { fontSize: 12, textAlign: "center", paddingHorizontal: 24 },
  tabButtons: { flexDirection: "row", gap: 8 },
  tabBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12 },
  activeTabBtn: { backgroundColor: "rgba(99, 102, 241, 0.08)" },
  tabBtnText: { fontSize: 11, fontWeight: "700" },

  badgesScroll: { gap: 12, paddingRight: 20 },
  badgeCard: { width: 110, borderRadius: 20, padding: 12, borderWidth: 1, alignItems: "center", gap: 4 },
  badgeIconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", marginBottom: 6 },
  badgeTitle: { fontSize: 11, fontWeight: "800", textAlign: "center" },
  badgeDesc: { fontSize: 8, fontWeight: "600", textAlign: "center", lineHeight: 10 },

  aiCard: { borderRadius: 24, padding: 20, borderWidth: 1, marginBottom: 20 },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  aiTitle: { fontSize: 15, fontWeight: "800" },
  correlationsGrid: { flexDirection: "row", gap: 8, marginBottom: 16 },
  corrItem: { flex: 1, borderRadius: 16, padding: 10, alignItems: "center" },
  corrLabel: { fontSize: 8, fontWeight: "700", textAlign: "center" },
  corrVal: { fontSize: 16, fontWeight: "900", marginTop: 4 },
  aiInsightsList: { gap: 10 },
  insightRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  insightIcon: { marginTop: 2 },
  insightText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "500" },

  practiceBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderRadius: 20, paddingVertical: 16 },
  practiceBtnText: { fontSize: 13, fontWeight: "800" },

  bigDomainCard: { flexDirection: "row", alignItems: "center", borderRadius: 24, padding: 16, borderWidth: 1, marginBottom: 12, gap: 16 },
  bigDomainIconWrap: { width: 60, height: 60, borderRadius: 30, justifyContent: "center", alignItems: "center" },
  bigDomainIcon: { fontSize: 32 },
  bigDomainBody: { flex: 1 },
  bigDomainTitle: { fontSize: 16, fontWeight: "800" },
  bigDomainScience: { fontSize: 10, fontWeight: "700", marginTop: 2 },
  bigDomainDesc: { fontSize: 12, marginTop: 4 },

  testRowCard: { borderRadius: 20, padding: 18, borderWidth: 1, marginBottom: 12 },
  testRowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  testRowName: { fontSize: 15, fontWeight: "800" },
  testRowDesc: { fontSize: 12, lineHeight: 18 },

  countdownText: { fontSize: 110, fontWeight: "900", marginBottom: 16 },
  subText: { fontSize: 18, fontWeight: "700" },

  resultsCard: { borderRadius: 28, padding: 28, borderWidth: 1, elevation: 4, width: W - 48, alignItems: "center" },
  resultsIconWrap: { width: 90, height: 90, borderRadius: 45, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  resultsTitle: { fontSize: 20, fontWeight: "900", textAlign: "center", marginBottom: 16 },
  resultsScoreBadge: { borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12, alignItems: "center", marginBottom: 24 },
  resultsScoreText: { fontSize: 44, fontWeight: "900" },
  resultsGradeLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", marginTop: 2 },
  resultsStatsRow: { flexDirection: "row", justifyContent: "space-around", width: "100%", marginBottom: 32 },
  resultsStatCol: { alignItems: "center" },
  resultsStatVal: { fontSize: 22, fontWeight: "900" },
  resultsStatLabel: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  resultsFinishBtn: { width: "100%", borderRadius: 20, paddingVertical: 16, alignItems: "center", elevation: 2 },
  resultsFinishBtnText: { color: "#ffffff", fontWeight: "900", fontSize: 15, letterSpacing: 1 },

  reportHeroCard: { borderRadius: 28, padding: 32, alignItems: "center", marginHorizontal: 20, marginTop: 16, marginBottom: 16 },
  reportGradeVal: { fontSize: 72, fontWeight: "900", lineHeight: 80 },
  reportScoreVal: { fontSize: 40, fontWeight: "900" },
  reportScoreLbl: { fontSize: 10, letterSpacing: 2, fontWeight: "800", marginTop: 2 },
  reportInsightCard: { flexDirection: "row", gap: 12, padding: 18, borderStyle: "solid", borderWidth: 1, borderRadius: 20, marginHorizontal: 20, marginBottom: 20, alignItems: "flex-start" },
  reportInsightText: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: "500" },
  reportBreakdownRow: { borderRadius: 20, padding: 16, borderWidth: 1, marginHorizontal: 20, marginBottom: 10 },
  reportBreakdownHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  reportBreakdownLabel: { fontSize: 14, fontWeight: "800" },
  reportBreakdownScore: { fontSize: 16, fontWeight: "900" },
  reportBreakdownBarTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(100,116,139,0.08)", overflow: "hidden" },
  reportBreakdownBarFill: { height: "100%", borderRadius: 3 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalCard: { borderRadius: 28, padding: 24, borderWidth: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: "900" },
  settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "rgba(100,116,139,0.08)", marginBottom: 12 },
  settingLabel: { fontSize: 14, fontWeight: "800" },
  settingDesc: { fontSize: 11, marginTop: 2 },
});