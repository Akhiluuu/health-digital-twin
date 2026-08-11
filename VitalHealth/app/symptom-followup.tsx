import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSymptoms } from "../context/SymptomContext";
import { useTheme } from "../context/ThemeContext";
import { useThemeAlert } from "../context/ThemeAlertContext";
import { saveFollowUpAnswers } from "../database/symptomDB";

///////////////////////////////////////////////////////////

export default function Followup() {
  const router = useRouter();
  const { theme } = useTheme();
  const { showAlert } = useThemeAlert();
  const { resolveSymptom } = useSymptoms();

  const params = useLocalSearchParams();
  const id = params.id as string | undefined;
  const name = params.name as string | undefined;

  const [step, setStep] = useState<"initial" | "questions">("initial");
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState<boolean | null>(null);

  // Safe ID parse
  const symptomId = Number(id);

  if (!symptomId) {
    return (
      <View style={styles.center}>
        <Text>Invalid symptom</Text>
      </View>
    );
  }

  // Theme colors
  const colors: any =
    theme === "light"
      ? {
          bg: "#f8fafc",
          card: "#ffffff",
          text: "#020617",
          sub: "#64748b",
          accent: "#38bdf8",
          danger: "#ef4444",
          warning: "#f59e0b",
          success: "#10b981",
          border: "#e2e8f0",
        }
      : {
          bg: "#020617",
          card: "#0f172a",
          text: "#f1f5f9",
          sub: "#94a3b8",
          accent: "#38bdf8",
          danger: "#ef4444",
          warning: "#f59e0b",
          success: "#10b981",
          border: "#334155",
        };

  const navigateBackOrHome = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  // Initial question: "I'm fine" or "Yes"
  const handleImFine = async () => {
    await resolveSymptom(symptomId);

    showAlert({
      title: "Recovered ✅",
      message: "Great! Symptom marked as resolved. It will remain in your history.",
      type: "success",
      buttons: [{ text: "OK", onPress: navigateBackOrHome }],
    });
  };

  const handleYesStillPresent = () => {
    // Navigate to detailed questions
    setStep("questions");
  };

  // Detailed follow-up questions
  const questions = [
    {
      id: "worsening",
      text: "Has the symptom gotten worse since you first noticed it?",
      risk: true,
    },
    {
      id: "newSymptoms",
      text: "Have you developed any new symptoms alongside this one?",
      risk: true,
    },
    {
      id: "affectsDaily",
      text: "Is this symptom affecting your daily activities?",
      risk: true,
    },
  ];

  const handleAnswer = (questionId: string, answer: boolean) => {
    setAnswers({ ...answers, [questionId]: answer });
    setCurrentAnswer(answer);
  };

  const handleNextQuestion = () => {
    // Save the current answer
    const currentQuestion = questions[currentQuestionIndex];
    if (currentQuestion) {
      setAnswers({ ...answers, [currentQuestion.id]: currentAnswer });
    }
    
    // Move to next question or finish if last
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setCurrentAnswer(null); // Reset for next question
    } else {
      finishQuestions();
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      // Restore previous answer if exists
      const prevQuestion = questions[currentQuestionIndex - 1];
      setCurrentAnswer(answers[prevQuestion.id] ?? null);
    }
  };

  const analyzeRisk = () => {
    // Check if any risk factors are present
    const riskFactors: string[] = [];
    
    if (answers["worsening"]) riskFactors.push("Symptoms worsening");
    if (answers["newSymptoms"]) riskFactors.push("New symptoms developed");
    if (answers["affectsDaily"]) riskFactors.push("Affects daily activities");

    if (riskFactors.length >= 2) {
      return "high";
    } else if (riskFactors.length === 1) {
      return "moderate";
    }
    return "low";
  };

  const finishQuestions = () => {
    // Save the answers to the database
    const answersJson = JSON.stringify(answers);
    saveFollowUpAnswers(symptomId, answersJson);
    
    const riskLevel = analyzeRisk();

    if (riskLevel === "high") {
      showAlert({
        title: "⚠️ Consult a Doctor",
        message: "Based on your responses, we recommend consulting a healthcare professional. Your symptoms may require medical attention.",
        type: "error",
        buttons: [{ text: "Understood", onPress: navigateBackOrHome }],
      });
    } else if (riskLevel === "moderate") {
      showAlert({
        title: "⚡ Monitor Closely",
        message: "Your symptoms warrant close monitoring. If they worsen, please consult a doctor.",
        type: "warning",
        buttons: [{ text: "Keep Tracking", onPress: navigateBackOrHome }],
      });
    } else {
      showAlert({
        title: "✅ Symptoms Improving",
        message: "Great! Your symptoms appear to be improving. Keep monitoring.",
        type: "success",
        buttons: [{ text: "OK", onPress: navigateBackOrHome }],
      });
    }
  };

  // Render initial screen
  if (step === "initial") {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {/* Header with back button and title */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={navigateBackOrHome}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={[styles.title, { color: colors.text }]}>
            Symptom Check-in
          </Text>

          <View style={{ width: 24 }} />
        </View>

        {name && (
          <Text style={[styles.symptom, { color: colors.sub }]}>
            How are you feeling about: {name}?
          </Text>
        )}

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {/* I'M FINE - Resolve symptom, keep in history */}
          <TouchableOpacity
            style={[styles.mainButton, { backgroundColor: colors.success }]}
            onPress={handleImFine}
          >
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
            <Text style={styles.btnText}>I'm fine - Feeling Better</Text>
          </TouchableOpacity>

          {/* YES - Still present, go to questions */}
          <TouchableOpacity
            style={[styles.mainButton, { backgroundColor: colors.danger }]}
            onPress={handleYesStillPresent}
          >
            <Ionicons name="alert-circle" size={24} color="#fff" />
            <Text style={styles.btnText}>Yes - Still Present</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.hint, { color: colors.sub }]}>
          "I'm fine" will remove this symptom from your active list but keep it in your history.
          {"\n"}
          "Yes" will ask you some questions to assess if you need medical attention.
        </Text>
      </View>
    );
  }

  // Render detailed questions
  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header with back button and title */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => setStep("initial")}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.text }]}>
          Follow-up Questions
        </Text> 

        <View style={{ width: 24 }} />
      </View>

      {name && (
        <Text style={[styles.symptom, { color: colors.sub }]}>
          Assessing: {name}
        </Text>
      )}

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {/* Progress indicator */}
        <View style={styles.progressContainer}>
          <Text style={[styles.progressText, { color: colors.sub }]}>
            Question {currentQuestionIndex + 1} of {questions.length}
          </Text>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  backgroundColor: colors.accent,
                  width: `${((currentQuestionIndex + 1) / questions.length) * 100}%`
                }
              ]} 
            />
          </View>
        </View>

        {/* Single question display */}
        <View style={styles.questionBlock}>
          <Text style={[styles.questionLabel, { color: colors.text }]}>
            {questions[currentQuestionIndex].text}
          </Text>
          
          <View style={styles.yesNoRow}>
            <TouchableOpacity
              style={[
                styles.yesNoButton,
                { 
                  backgroundColor: currentAnswer === true ? colors.danger : colors.card,
                  borderColor: colors.border 
                }
              ]}
              onPress={() => handleAnswer(questions[currentQuestionIndex].id, true)}
            >
              <Text style={{ 
                color: currentAnswer === true ? "#fff" : colors.text 
              }}>
                Yes
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.yesNoButton,
                { 
                  backgroundColor: currentAnswer === false ? colors.success : colors.card,
                  borderColor: colors.border 
                }
              ]}
              onPress={() => handleAnswer(questions[currentQuestionIndex].id, false)}
            >
              <Text style={{ 
                color: currentAnswer === false ? "#fff" : colors.text 
              }}>
                No
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Navigation buttons */}
        <View style={styles.navigationRow}>
          {currentQuestionIndex > 0 && (
            <TouchableOpacity
              style={[styles.navButton, { borderColor: colors.border }]}
              onPress={handlePreviousQuestion}
            >
              <Text style={[styles.navButtonText, { color: colors.text }]}>Previous</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={[
              styles.submitButton, 
              { 
                backgroundColor: colors.accent,
                flex: 1,
                marginLeft: currentQuestionIndex > 0 ? 12 : 0
              }
            ]}
            onPress={handleNextQuestion}
            disabled={currentAnswer === null}
          >
            <Text style={styles.submitText}>
              {currentQuestionIndex === questions.length - 1 ? "Submit" : "Next"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

///////////////////////////////////////////////////////////

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    marginTop: 30,
  },
  backButton: {
    width: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 7
  },
  symptom: {
    textAlign: "center",
    marginBottom: 50,
    fontSize: 16
  },
  card: {
    borderRadius: 24,
    padding: 24,
    gap: 16
  },
  mainButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    borderRadius: 18,
    gap: 10,
  },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold"
  },
  hint: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
  },
  questionText: {
    fontSize: 16,
    marginBottom: 20,
    lineHeight: 22,
  },
  questionBlock: {
    marginBottom: 20,
  },
  questionLabel: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 12,
    lineHeight: 22,
  },
  yesNoRow: {
    flexDirection: "row",
    gap: 12,
  },
  yesNoButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  submitButton: {
    padding: 18,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 10,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressText: {
    fontSize: 13,
    marginBottom: 8,
    textAlign: "center",
  },
  progressBar: {
    height: 6,
    backgroundColor: "#e2e8f0",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  navigationRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  navButton: {
    flex: 1,
    padding: 18,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 1,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
