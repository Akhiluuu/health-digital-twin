// app/symptom-flow.tsx
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useTheme } from "../context/ThemeContext";
import { SymptomAnalysis, symptomDB, SymptomOption } from "../data/symptomData";
import { useSymptoms } from "../context/SymptomContext";



export default function SymptomFlow() {
  const router = useRouter();
  const params = useLocalSearchParams<{
  type?: string | string[];
}>();
const { logSymptom, refreshSymptoms } = useSymptoms();
const type = Array.isArray(params.type)
  ? params.type[0]
  : params.type; // ✅ FIXED
  const { theme } = useTheme();

  const symptom = type ? symptomDB[type] : undefined; // ✅ FIXED

  const colors = theme === "light" ? {
    bg: "#f8fafc",
    card: "#ffffff",
    text: "#020617",
    sub: "#64748b",
    border: "#e2e8f0",
    accent: symptom?.color || "#38bdf8",
  } : {
    bg: "#020617",
    card: "#0f172a",
    text: "#f1f5f9",
    sub: "#94a3b8",
    border: "#334155",
    accent: symptom?.color || "#38bdf8",
  };

  const [step, setStep] = useState<'options' | 'questions' | 'analysis'>('options');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [analysis, setAnalysis] = useState<SymptomAnalysis | null>(null);
  const [fadeAnim] = useState(new Animated.Value(1));

  if (!symptom) {
  return (
    <View style={[styles.container, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }]}>
      <Text style={{ fontSize: 18 }}>Symptom not found</Text>
    </View>
  );
}

  const handleSelectOption = (optionId: string) => {
    if (selectedOptions.includes(optionId)) {
      setSelectedOptions(selectedOptions.filter(id => id !== optionId));
    } else {
      setSelectedOptions([...selectedOptions, optionId]);
    }
  };

  const handleAnswerQuestion = (questionId: string, answer: any) => {
    setAnswers({
      ...answers,
      [questionId]: answer,
    });

    // Move to next question or analysis
    if (currentQuestionIndex < symptom.questions.length - 1) {
      // Fade animation
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      // All questions answered - show analysis
      generateAnalysis();
    }
  };

  const generateAnalysis = () => {
    // Combine selected options and answers
    const fullAnswers = {
      ...answers,
      selectedOptions,
    };

    const result = symptom.analyze(fullAnswers);
    setAnalysis(result);
    setStep('analysis');
  };

  const saveSymptom = async () => {
  try {
    if (!type) {
      Alert.alert("Error", "Invalid symptom type.");
      return;
    }

    if (!analysis) {
      Alert.alert("Error", "Analysis not completed.");
      return;
    }

    const selectedOptionId =
      selectedOptions.length > 0 ? selectedOptions[0] : "general";

    const followUpAnswers = JSON.stringify({
      options: selectedOptions,
      ...answers,
    });

    console.log("Saving symptom via context...");

    // ✅ Save using SymptomContext
    await logSymptom(
      type,
      selectedOptionId,
      symptom.label,
      analysis.severity || "mild",
      30,
      "",
      followUpAnswers
    );

    // Refresh Home Page data
    await refreshSymptoms();

    console.log("✅ Symptom logged successfully");

    Alert.alert("Symptom Logged", "Saved successfully!", [
      {
        text: "Go to Home",
        onPress: () => router.replace("/(tabs)"),
      },
    ]);
  } catch (error) {
    console.error("❌ Error saving symptom:", error);
    Alert.alert("Error", "Failed to save symptom.");
  }
};

  const renderOptions = () => (
    <Animated.View style={{ opacity: fadeAnim }}>
      <Text style={[styles.question, { color: colors.text }]}>
        What symptoms are you experiencing?
      </Text>
      
      {symptom.options.map((option: SymptomOption) => (
        <TouchableOpacity
          key={option.id}
          style={[
            styles.optionCard,
            { 
              backgroundColor: colors.card,
              borderColor: selectedOptions.includes(option.id) ? colors.accent : colors.border,
              borderWidth: selectedOptions.includes(option.id) ? 2 : 1,
            }
          ]}
          onPress={() => handleSelectOption(option.id)}
        >
          <View style={styles.optionContent}>
            <View style={[styles.optionDot, { backgroundColor: selectedOptions.includes(option.id) ? colors.accent : 'transparent' }]} />
            <View style={styles.optionText}>
              <Text style={[styles.optionLabel, { color: colors.text }]}>
                {option.label}
              </Text>
              {option.description && (
                <Text style={[styles.optionDescription, { color: colors.sub }]}>
                  {option.description}
                </Text>
              )}
            </View>
          </View>
          {option.severity && (
            <View style={[styles.severityBadge, { 
              backgroundColor: 
                option.severity === 'mild' ? '#10b98120' :
                option.severity === 'moderate' ? '#f59e0b20' :
                '#ef444420'
            }]}>
              <Text style={[styles.severityText, { 
                color: 
                  option.severity === 'mild' ? '#10b981' :
                  option.severity === 'moderate' ? '#f59e0b' :
                  '#ef4444'
              }]}>
                {option.severity}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[styles.nextButton, { backgroundColor: colors.accent }]}
        onPress={() => {
  if (selectedOptions.length === 0) {
    Alert.alert(
      "Select a Symptom",
      "Please select at least one symptom to continue."
    );
    return;
  }
  setStep("questions");
}}
      >
        <Text style={styles.nextButtonText}>Next: Answer Questions</Text>
        <Ionicons name="arrow-forward" size={20} color="#fff" />
      </TouchableOpacity>
    </Animated.View>
  );

  const renderQuestions = () => {
    const question = symptom.questions[currentQuestionIndex];

    const renderQuestionInput = () => {
      switch (question.type) {
        case 'yesno':
          return (
            <View style={styles.yesNoContainer}>
              <TouchableOpacity
                style={[styles.yesNoButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleAnswerQuestion(question.id, true)}
              >
                <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                <Text style={[styles.yesNoText, { color: colors.text }]}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.yesNoButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleAnswerQuestion(question.id, false)}
              >
                <Ionicons name="close-circle" size={24} color="#ef4444" />
                <Text style={[styles.yesNoText, { color: colors.text }]}>No</Text>
              </TouchableOpacity>
            </View>
          );

        case 'scale':
          return (
            <View style={styles.scaleContainer}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                <TouchableOpacity
                  key={num}
                  style={[
                    styles.scaleButton,
                    { 
                      backgroundColor: answers[question.id] === num ? colors.accent : colors.card,
                      borderColor: colors.border,
                    }
                  ]}
                  onPress={() => handleAnswerQuestion(question.id, num)}
                >
                  <Text style={[
                    styles.scaleText,
                    { color: answers[question.id] === num ? '#fff' : colors.text }
                  ]}>
                    {num}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          );

        case 'multiple':
          return (
            <View style={styles.multipleContainer}>
              {question.options?.map((opt, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.multipleButton,
                    { 
                      backgroundColor: answers[question.id] === opt ? colors.accent : colors.card,
                      borderColor: colors.border,
                    }
                  ]}
                  onPress={() => handleAnswerQuestion(question.id, opt)}
                >
                  <Text style={[
                    styles.multipleText,
                    { color: answers[question.id] === opt ? '#fff' : colors.text }
                  ]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          );

        default:
          return null;
      }
    };

    return (
      <Animated.View style={{ opacity: fadeAnim }}>
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  backgroundColor: colors.accent,
                  width: `${((currentQuestionIndex + 1) / symptom.questions.length) * 100}%` 
                }
              ]} 
            />
          </View>
          <Text style={[styles.progressText, { color: colors.sub }]}>
            Question {currentQuestionIndex + 1} of {symptom.questions.length}
          </Text>
        </View>

        <Text style={[styles.question, { color: colors.text }]}>
          {question.text}
        </Text>

        {renderQuestionInput()}

        {question.followUp && (
          <Text style={[styles.followUp, { color: colors.sub }]}>
            {question.followUp}
          </Text>
        )}
      </Animated.View>
    );
  };

  const renderAnalysis = () => (
    <ScrollView style={styles.analysisContainer}>
      <View style={[styles.severityBanner, { 
        backgroundColor: 
          analysis?.severity === 'emergency' ? '#ef4444' :
          analysis?.severity === 'severe' ? '#f97316' :
          analysis?.severity === 'moderate' ? '#f59e0b' :
          '#10b981'
      }]}>
        <Ionicons 
          name={
            analysis?.severity === 'emergency' ? 'alert-circle' :
            analysis?.severity === 'severe' ? 'warning' :
            analysis?.severity === 'moderate' ? 'information-circle' :
            'checkmark-circle'
          } 
          size={32} 
          color="#fff" 
        />
        <Text style={styles.severityBannerText}>
          {analysis?.severity.toUpperCase()}
        </Text>
      </View>

      <View style={[styles.analysisCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.analysisTitle, { color: colors.text }]}>
          Recommendation
        </Text>
        <Text style={[styles.analysisText, { color: colors.sub }]}>
          {analysis?.recommendation}
        </Text>

        <Text style={[styles.analysisSubtitle, { color: colors.text }]}>
          Actions to Take
        </Text>
        {analysis?.actions.map((action, index) => (
          <View key={index} style={styles.bulletPoint}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
            <Text style={[styles.bulletText, { color: colors.sub }]}>{action}</Text>
          </View>
        ))}

        {analysis?.homeRemedies && analysis.homeRemedies.length > 0 && (
          <>
            <Text style={[styles.analysisSubtitle, { color: colors.text }]}>
              Home Remedies
            </Text>
            {analysis.homeRemedies.map((remedy, index) => (
              <View key={index} style={styles.bulletPoint}>
                <Ionicons name="leaf" size={18} color="#10b981" />
                <Text style={[styles.bulletText, { color: colors.sub }]}>{remedy}</Text>
              </View>
            ))}
          </>
        )}

        {analysis?.warningSigns && analysis.warningSigns.length > 0 && (
          <>
            <Text style={[styles.analysisSubtitle, { color: colors.text }]}>
              Watch For
            </Text>
            {analysis.warningSigns.map((sign, index) => (
              <View key={index} style={styles.bulletPoint}>
                <Ionicons name="alert-circle" size={18} color="#ef4444" />
                <Text style={[styles.bulletText, { color: colors.sub }]}>{sign}</Text>
              </View>
            ))}
          </>
        )}

        {analysis?.seeDoctor && (
          <View style={[styles.doctorNote, { backgroundColor: "#ef444420" }]}>
            <Ionicons name="alert-circle" size={22} color="#ef4444" />
            <Text style={[styles.doctorNoteText, { color: "#ef4444" }]}>
              ⚠️ SEEK MEDICAL ATTENTION IMMEDIATELY
            </Text>
          </View>
        )}  
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.accent }]}
          onPress={async () => {
            await saveSymptom();
            const symptomLabel = symptom?.label || type || "Symptom";
            const details = selectedOptions.map(id => symptom?.options?.find((o: any) => o.id === id)?.label || id).join(", ");
            const queryText = `I am experiencing ${symptomLabel}${details ? ` (${details})` : ""}. Severity: ${analysis?.severity || "moderate"}. Recommendations: ${analysis?.recommendation || ""}. Please analyze with my medical profile and provide a clinical action plan.`;
            router.push({
              pathname: "/(tabs)/ai-health",
              params: {
                symptom: queryText,
                source: "symptom-flow",
              },
            });
          }}
        >
          <Ionicons name="sparkles" size={20} color="#fff" />
          <Text style={styles.actionButtonText}>Ask VitalHealth AI Assistant</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
          onPress={saveSymptom}
        >
          <Ionicons name="save-outline" size={20} color={colors.text} />
          <Text style={[styles.actionButtonText, { color: colors.text }]}>Log & Save Only</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
          onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }}
        >
          <Ionicons name="close" size={20} color={colors.sub} />
          <Text style={[styles.actionButtonText, { color: colors.sub }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {symptom.label}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {step === 'options' && renderOptions()}
        {step === 'questions' && renderQuestions()}
        {step === 'analysis' && renderAnalysis()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  question: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 24,
    lineHeight: 30,
  },
  optionCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  optionDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#64748b",
    marginRight: 12,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 13,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  severityText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    borderRadius: 16,
    marginTop: 24,
    gap: 8,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  progressContainer: {
    marginBottom: 30,
  }, 
  progressBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    textAlign: "right",
  },
  yesNoContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  yesNoButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  yesNoText: {
    fontSize: 16,
    fontWeight: "500",
  },
  scaleContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
  },
  scaleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scaleText: {
    fontSize: 14,
    fontWeight: "500",
  },
  multipleContainer: {
    gap: 10,
    marginTop: 20,
  },
  multipleButton: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  multipleText: {
    fontSize: 15,
    fontWeight: "500",
  },
  followUp: {
    fontSize: 13,
    marginTop: 16,
    fontStyle: "italic",
  },
  analysisContainer: {
    flex: 1,
  },
  severityBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    gap: 8,
  },
  severityBannerText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  analysisCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  analysisTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  analysisSubtitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 12,
  },
  analysisText: {
    fontSize: 15,
    lineHeight: 22,
  },
  bulletPoint: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  doctorNote: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  doctorNoteText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  actionButtons: {
    gap: 12,
    marginTop: 10,
    marginBottom: 30,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 16,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});