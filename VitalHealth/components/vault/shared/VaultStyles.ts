import { StyleSheet, Dimensions } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export const getVaultStyles = (c: any) => {
  return StyleSheet.create({
    scrollPadding: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 40,
    },
    // Care Circle Switcher
    careCircleContainer: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.card,
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
      fontWeight: "600",
    },

    // Glassmorphic Hero Score Card
    heroCard: {
      borderRadius: 24,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.15)",
      elevation: 6,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
    },
    heroBadgeLabel: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    heroTitle: {
      fontSize: 26,
      fontWeight: "800",
      color: "#ffffff",
    },
    heroSub: {
      fontSize: 13,
      marginTop: 6,
      lineHeight: 18,
    },
    heroRing: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: "rgba(255, 255, 255, 0.15)",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 3,
    },
    statBadgesRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 10,
      marginTop: 16,
    },
    statBadgeItem: {
      flex: 1,
      backgroundColor: "rgba(255, 255, 255, 0.12)",
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.15)",
    },
    statBadgeVal: {
      color: "#ffffff",
      fontWeight: "800",
      fontSize: 16,
      marginTop: 4,
    },
    statBadgeLbl: {
      fontSize: 10,
      fontWeight: "700",
      marginTop: 2,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },

    // Next Scheduled Dose Spotlight Card
    nextDoseCard: {
      borderRadius: 24,
      padding: 20,
      marginBottom: 22,
      elevation: 5,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    },
    nextDoseHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    nextDoseBadge: {
      backgroundColor: "rgba(255, 255, 255, 0.2)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    nextDoseBadgeText: {
      color: "#ffffff",
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.8,
    },
    nextDoseTime: {
      color: "rgba(255, 255, 255, 0.9)",
      fontSize: 13,
      fontWeight: "700",
    },
    nextDoseMain: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 16,
    },
    nextDosePillContainer: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: "rgba(255, 255, 255, 0.2)",
      justifyContent: "center",
      alignItems: "center",
    },
    nextDoseName: {
      color: "#ffffff",
      fontSize: 20,
      fontWeight: "800",
    },
    nextDoseDose: {
      color: "rgba(255, 255, 255, 0.9)",
      fontSize: 14,
      marginTop: 2,
      fontWeight: "600",
    },
    nextDoseReason: {
      color: "rgba(255, 255, 255, 0.75)",
      fontSize: 12,
      marginTop: 4,
    },
    nextDoseActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 8,
      gap: 8,
    },
    nextActionBtn: {
      flex: 1,
      height: 42,
      borderRadius: 14,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
    },
    nextActionTxt: {
      color: "#ffffff",
      fontSize: 12,
      fontWeight: "700",
    },

    // Empty State Placeholder
    nextDoseCardPlaceholder: {
      borderRadius: 24,
      borderWidth: 1,
      padding: 28,
      marginBottom: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.card,
      borderColor: c.border,
    },
    placeholderTitle: {
      fontSize: 17,
      fontWeight: "800",
      marginTop: 12,
      color: c.text,
    },
    placeholderSub: {
      fontSize: 13,
      marginTop: 4,
      color: c.sub,
      textAlign: "center",
      lineHeight: 18,
    },

    // Regimen Time Slots
    regimenSlotContainer: {
      marginBottom: 22,
    },
    regimenSlotTitle: {
      fontSize: 13,
      fontWeight: "800",
      color: c.accent,
      marginBottom: 10,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    regimenCard: {
      borderRadius: 20,
      borderWidth: 1,
      padding: 16,
      marginBottom: 12,
      backgroundColor: c.card,
      borderColor: c.border,
      flexDirection: "row",
      alignItems: "center",
      elevation: 2,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
    },
    regimenCardContent: {
      flex: 1,
      marginLeft: 14,
    },
    regimenCardName: {
      fontSize: 16,
      fontWeight: "700",
      color: c.text,
    },
    regimenCardDetails: {
      fontSize: 13,
      color: c.sub,
      marginTop: 2,
      fontWeight: "500",
    },
    regimenCardInstructions: {
      fontSize: 12,
      color: c.sub,
      marginTop: 3,
    },
    regimenCardActions: {
      flexDirection: "row",
      gap: 8,
    },
    logButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: "#22c55e",
      justifyContent: "center",
      alignItems: "center",
    },
    logButtonTxt: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: 13,
    },
    skipButton: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: c.bg,
    },
    skipButtonTxt: {
      fontSize: 13,
      fontWeight: "600",
    },

    // Cabinet Cards
    cabinetHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
      marginTop: 6,
    },
    cabinetSectionTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: c.text,
    },
    actionPillButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.accent,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      gap: 6,
    },
    actionPillText: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: 12,
    },
    lowStockBadge: {
      backgroundColor: "#ef444420",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      alignSelf: "flex-start",
    },
    lowStockTxt: {
      color: "#ef4444",
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.5,
    },

    // Refill Action Button
    refillButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
    },
    refillButtonTxt: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: 12,
    },

    // Wizard Intake Flow
    wizardProgressContainer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 4,
    },
    wizardProgressTrack: {
      height: 6,
      borderRadius: 3,
      width: "100%",
      backgroundColor: c.border,
      overflow: "hidden",
    },
    wizardProgressBar: {
      height: "100%",
      borderRadius: 3,
    },
    wizardScroll: {
      padding: 20,
      paddingBottom: 60,
    },
    wizardTitle: {
      fontSize: 24,
      fontWeight: "800",
      color: c.text,
      marginBottom: 6,
    },
    wizardSubtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: c.sub,
      marginBottom: 24,
    },
    wizardMethodGrid: {
      gap: 14,
    },
    methodCard: {
      borderWidth: 1.5,
      borderRadius: 20,
      padding: 18,
      flexDirection: "row",
      alignItems: "center",
    },
    methodIconContainer: {
      width: 50,
      height: 50,
      borderRadius: 25,
      justifyContent: "center",
      alignItems: "center",
    },
    methodInfo: {
      marginLeft: 14,
      flex: 1,
    },
    methodTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: c.text,
    },
    methodDesc: {
      fontSize: 12,
      marginTop: 4,
      lineHeight: 16,
    },

    // Form inputs
    wizardFormLabel: {
      fontSize: 11,
      fontWeight: "800",
      marginBottom: 8,
      marginTop: 18,
      textTransform: "uppercase",
      letterSpacing: 1,
      color: c.sub,
    },
    wizardFormInput: {
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 16,
      height: 52,
      fontSize: 15,
      color: c.text,
    },
    wizardFormRow: {
      flexDirection: "row",
      gap: 12,
    },
    wizardFormHalfInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 16,
      height: 52,
      fontSize: 15,
      color: c.text,
    },
    formPillGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 10,
    },
    formPillChip: {
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    formPillText: {
      fontSize: 13,
      fontWeight: "700",
    },

    // Quantity Counter Control
    qtyCounterBtn: {
      width: 48,
      height: 48,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      alignItems: "center",
      justifyContent: "center",
    },
    qtyCounterVal: {
      fontSize: 22,
      fontWeight: "800",
      color: c.text,
    },

    // Navigation buttons
    wizardActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 32,
      marginBottom: 20,
    },
    wizardBackBtn: {
      height: 52,
      paddingHorizontal: 26,
      borderRadius: 16,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    wizardBackBtnTxt: {
      fontSize: 15,
      fontWeight: "700",
    },
    wizardNextBtn: {
      height: 52,
      paddingHorizontal: 26,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
      flex: 1,
      marginLeft: 12,
    },
    wizardNextBtnTxt: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "800",
    },

    // General Section Titles & Modals
    sectionTitle: {
      fontSize: 18,
      fontWeight: "800",
      marginTop: 20,
      marginBottom: 12,
      color: c.text,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    modalContent: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 24,
      maxHeight: "90%",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    treatmentTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: c.text,
    },
    reorderButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    reorderTxt: {
      color: "#ffffff",
      fontWeight: "800",
      fontSize: 14,
    },
  });
};
