import { StyleSheet, Dimensions } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export const getVaultStyles = (c: any) => {
  return StyleSheet.create({
    scrollPadding: {
      padding: 16,
      paddingBottom: 40,
    },
    // Care Circle Switcher
    careCircleContainer: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    avatarRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    avatarTouch: {
      alignItems: "center",
      marginRight: 18,
    },
    avatarRing: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 2,
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
    },
    avatarLetter: {
      fontSize: 18,
      fontWeight: "700",
      color: "#ffffff",
    },
    avatarName: {
      fontSize: 11,
      marginTop: 4,
      fontWeight: "500",
    },
    // Today's Regimen Dashboard Score
    scoreCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      marginBottom: 16,
      backgroundColor: c.card,
      borderColor: c.border,
    },
    scoreRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    scoreTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: c.text,
    },
    scoreSub: {
      fontSize: 11,
      marginTop: 4,
      lineHeight: 14,
      color: c.sub,
    },
    scoreDetailsRow: {
      flexDirection: "row",
      marginTop: 12,
    },
    scoreDetailItem: {
      marginRight: 20,
    },
    scoreDetailValue: {
      fontSize: 18,
      fontWeight: "700",
    },
    scoreDetailLabel: {
      fontSize: 10,
      color: c.sub,
    },
    ringContainer: {
      position: "relative",
      justifyContent: "center",
      alignItems: "center",
      marginLeft: 12,
    },
    ringTextContainer: {
      position: "absolute",
      justifyContent: "center",
      alignItems: "center",
    },
    ringPercent: {
      fontSize: 14,
      fontWeight: "700",
      color: c.text,
    },
    // Next Dose
    nextDoseCard: {
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    },
    nextDoseHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    nextDoseBadge: {
      backgroundColor: "rgba(255, 255, 255, 0.2)",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
    },
    nextDoseBadgeText: {
      color: "#ffffff",
      fontSize: 9,
      fontWeight: "700",
    },
    nextDoseTime: {
      color: "#ffffff",
      fontSize: 12,
      fontWeight: "600",
    },
    nextDoseMain: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 14,
    },
    nextDosePillContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: "rgba(255, 255, 255, 0.2)",
      justifyContent: "center",
      alignItems: "center",
    },
    nextDoseName: {
      color: "#ffffff",
      fontSize: 18,
      fontWeight: "700",
    },
    nextDoseDose: {
      color: "rgba(255, 255, 255, 0.9)",
      fontSize: 13,
      marginTop: 2,
    },
    nextDoseReason: {
      color: "rgba(255, 255, 255, 0.7)",
      fontSize: 11,
      marginTop: 2,
    },
    nextDoseActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 8,
      gap: 6,
    },
    nextActionBtn: {
      flex: 1,
      height: 38,
      borderRadius: 8,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 4,
    },
    nextActionTxt: {
      color: "#ffffff",
      fontSize: 11,
      fontWeight: "700",
    },
    nextDoseCardPlaceholder: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 24,
      marginBottom: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.card,
      borderColor: c.border,
    },
    placeholderTitle: {
      fontSize: 15,
      fontWeight: "700",
      marginTop: 10,
      color: c.text,
    },
    placeholderSub: {
      fontSize: 12,
      marginTop: 4,
      color: c.sub,
    },
    // Regimen Slots
    regimenSlotContainer: {
      marginBottom: 20,
    },
    regimenSlotTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: c.sub,
      marginBottom: 10,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    regimenCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
      marginBottom: 10,
      backgroundColor: c.card,
      borderColor: c.border,
      flexDirection: "row",
      alignItems: "center",
    },
    regimenCardContent: {
      flex: 1,
      marginLeft: 12,
    },
    regimenCardName: {
      fontSize: 16,
      fontWeight: "700",
      color: c.text,
    },
    regimenCardDetails: {
      fontSize: 12,
      color: c.sub,
      marginTop: 2,
    },
    regimenCardInstructions: {
      fontSize: 11,
      color: c.sub,
      marginTop: 2,
    },
    regimenCardActions: {
      flexDirection: "row",
      gap: 6,
    },
    logButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: "#22c55e",
      justifyContent: "center",
      alignItems: "center",
    },
    logButtonTxt: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: 12,
    },
    skipButton: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: "center",
      alignItems: "center",
    },
    skipButtonTxt: {
      fontSize: 12,
      fontWeight: "600",
    },
    lateBadge: {
      backgroundColor: "#ef444420",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      alignSelf: "flex-start",
      marginTop: 4,
    },
    lateBadgeTxt: {
      color: "#ef4444",
      fontSize: 9,
      fontWeight: "700",
    },
    // Cabinet
    treatmentPlanCard: {
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 12,
      backgroundColor: c.card,
      borderColor: c.border,
      overflow: "hidden",
    },
    treatmentPlanHeader: {
      flexDirection: "row",
      padding: 16,
      alignItems: "center",
      justifyContent: "space-between",
    },
    treatmentTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: c.text,
    },
    treatmentInfo: {
      fontSize: 11,
      color: c.sub,
      marginTop: 2,
    },
    treatmentMedsList: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.bg,
    },
    treatmentMedRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    treatmentMedName: {
      fontSize: 14,
      fontWeight: "600",
      color: c.text,
    },
    treatmentMedSub: {
      fontSize: 11,
      color: c.sub,
      marginTop: 1,
    },
    detailTextLink: {
      fontSize: 12,
      color: c.accent,
      fontWeight: "700",
    },
    treatmentDocRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 10,
      gap: 6,
    },
    treatmentDocName: {
      fontSize: 12,
      fontWeight: "500",
      color: c.text,
    },
    // Inventory
    inventoryCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
      marginBottom: 10,
      backgroundColor: c.card,
      borderColor: c.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    inventoryName: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
    },
    inventoryDays: {
      fontSize: 12,
      color: c.sub,
      marginTop: 2,
    },
    lowStockBadge: {
      backgroundColor: "#ef444415",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
      marginTop: 4,
      alignSelf: "flex-start",
    },
    lowStockTxt: {
      color: "#ef4444",
      fontSize: 9,
      fontWeight: "700",
    },
    reorderButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    reorderTxt: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: 12,
    },
    // Assistant Chat
    assistantChatContainer: {
      flex: 1,
    },
    messageList: {
      padding: 16,
    },
    messageBubble: {
      maxWidth: "80%",
      padding: 12,
      borderRadius: 16,
      marginBottom: 12,
    },
    userBubble: {
      alignSelf: "flex-end",
      borderBottomRightRadius: 4,
    },
    assistantBubble: {
      alignSelf: "flex-start",
      borderBottomLeftRadius: 4,
    },
    messageText: {
      fontSize: 14,
      lineHeight: 18,
    },
    symptomShortcuts: {
      flexDirection: "row",
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
    },
    symptomChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: "center",
    },
    symptomChipText: {
      fontSize: 11,
      fontWeight: "600",
    },
    inputContainer: {
      flexDirection: "row",
      padding: 12,
      borderTopWidth: 1,
      alignItems: "center",
    },
    textInput: {
      flex: 1,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      paddingHorizontal: 16,
      fontSize: 14,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
      marginLeft: 10,
    },
    // Wizard
    wizardProgress: {
      height: 4,
      width: "100%",
      backgroundColor: "#e2e8f0",
    },
    wizardProgressBar: {
      height: "100%",
    },
    wizardScroll: {
      padding: 20,
    },
    wizardTitle: {
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 8,
    },
    wizardSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 20,
    },
    wizardMethodGrid: {
      gap: 12,
    },
    methodCard: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
    },
    methodIconContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
    },
    methodInfo: {
      marginLeft: 14,
      flex: 1,
    },
    methodTitle: {
      fontSize: 15,
      fontWeight: "700",
    },
    methodDesc: {
      fontSize: 11,
      marginTop: 2,
    },
    wizardFormInput: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 48,
      fontSize: 14,
      marginBottom: 16,
    },
    wizardFormRow: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 16,
    },
    wizardFormHalfInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 48,
      fontSize: 14,
    },
    wizardFormLabel: {
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    formPillGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 20,
    },
    formPillChip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    formPillText: {
      fontSize: 12,
      fontWeight: "600",
    },
    wizardActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 24,
      marginBottom: 40,
    },
    wizardBackBtn: {
      height: 48,
      paddingHorizontal: 24,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    wizardBackBtnTxt: {
      fontSize: 14,
      fontWeight: "700",
    },
    wizardNextBtn: {
      height: 48,
      paddingHorizontal: 24,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      flex: 1,
      marginLeft: 12,
    },
    wizardNextBtnTxt: {
      color: "#ffffff",
      fontSize: 14,
      fontWeight: "700",
    },
    // General styles
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      marginTop: 18,
      marginBottom: 10,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    modalContent: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      maxHeight: "90%",
    },
    // Missed dose / Review alerts
    reviewAlertBanner: {
      flexDirection: "row",
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      marginBottom: 16,
    },
    escalationTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 8,
    },
    escalationSub: {
      fontSize: 14,
      marginBottom: 12,
      lineHeight: 18,
    },
    escalationPrompt: {
      fontSize: 12,
      marginBottom: 16,
      lineHeight: 16,
    },
    escalationReasonBtn: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 8,
    },
    escalationReasonTxt: {
      fontSize: 13,
      fontWeight: "600",
    },
    escalationDismissBtn: {
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 16,
    },
    escalationDismissTxt: {
      fontSize: 13,
      fontWeight: "700",
    },
  });
};
