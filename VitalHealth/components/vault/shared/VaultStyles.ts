import { StyleSheet, Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const getVaultStyles = (c: any) => {
  return StyleSheet.create({
    scrollPadding: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 40,
    },
    // Care Circle Switcher Bar
    careCircleContainer: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    avatarRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    avatarTouch: {
      alignItems: "center",
      marginRight: 16,
    },
    avatarRing: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 2,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarLetter: {
      fontSize: 16,
      fontWeight: "700",
      color: "#ffffff",
    },
    avatarName: {
      fontSize: 11,
      marginTop: 4,
      fontWeight: "600",
    },

    // Glassmorphic Hero Compliance Card
    heroCard: {
      borderRadius: 20,
      padding: 18,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.18)",
      elevation: 4,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
    },
    heroBadgeLabel: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: "800",
      color: "#ffffff",
    },
    heroSub: {
      fontSize: 13,
      marginTop: 4,
      lineHeight: 18,
    },
    heroRing: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: "rgba(255, 255, 255, 0.15)",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2.5,
    },
    statBadgesRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 8,
      marginTop: 12,
    },
    statBadgeItem: {
      flex: 1,
      backgroundColor: "rgba(255, 255, 255, 0.12)",
      borderRadius: 14,
      paddingVertical: 10,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.15)",
    },
    statBadgeVal: {
      color: "#ffffff",
      fontWeight: "800",
      fontSize: 15,
      marginTop: 2,
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
      borderRadius: 20,
      padding: 18,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.15)",
      elevation: 4,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
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
      fontSize: 12,
      fontWeight: "700",
    },
    nextDoseMain: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 14,
    },
    nextDosePillContainer: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: "rgba(255, 255, 255, 0.2)",
      justifyContent: "center",
      alignItems: "center",
    },
    nextDoseName: {
      color: "#ffffff",
      fontSize: 18,
      fontWeight: "800",
    },
    nextDoseDose: {
      color: "rgba(255, 255, 255, 0.9)",
      fontSize: 13,
      marginTop: 2,
      fontWeight: "600",
    },
    nextDoseReason: {
      color: "rgba(255, 255, 255, 0.75)",
      fontSize: 12,
      marginTop: 2,
    },
    nextDoseActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 6,
      gap: 8,
    },
    nextActionBtn: {
      flex: 1,
      height: 40,
      borderRadius: 12,
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
      borderRadius: 20,
      borderWidth: 1,
      padding: 24,
      marginBottom: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.card,
      borderColor: c.border,
      elevation: 2,
      shadowColor: c.accent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
    },
    placeholderTitle: {
      fontSize: 16,
      fontWeight: "800",
      marginTop: 10,
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
      marginBottom: 18,
    },
    regimenSlotTitle: {
      fontSize: 12,
      fontWeight: "800",
      color: c.accent,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    regimenCard: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 14,
      marginBottom: 10,
      backgroundColor: c.card,
      borderColor: c.border,
      flexDirection: "row",
      alignItems: "center",
      elevation: 3,
      shadowColor: c.accent,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
    },
    regimenCardContent: {
      flex: 1,
      marginLeft: 12,
    },
    regimenCardName: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
    },
    regimenCardDetails: {
      fontSize: 12,
      color: c.sub,
      marginTop: 2,
      fontWeight: "500",
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
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
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
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: c.bg,
    },
    skipButtonTxt: {
      fontSize: 12,
      fontWeight: "600",
    },

    // Cabinet Cards
    cabinetHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
      marginTop: 4,
    },
    cabinetSectionTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: c.text,
    },
    actionPillButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.accent,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      gap: 4,
    },
    actionPillText: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: 12,
    },
    lowStockBadge: {
      backgroundColor: "#ef444420",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      alignSelf: "flex-start",
    },
    lowStockTxt: {
      color: "#ef4444",
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.5,
    },

    // Refill Action Button
    refillButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
    },
    refillButtonTxt: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: 12,
    },

    // Wizard Intake Flow
    wizardProgressContainer: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 4,
    },
    wizardProgressTrack: {
      height: 5,
      borderRadius: 2.5,
      width: "100%",
      backgroundColor: c.border,
      overflow: "hidden",
    },
    wizardProgressBar: {
      height: "100%",
      borderRadius: 2.5,
    },
    wizardScroll: {
      padding: 16,
      paddingBottom: 60,
    },
    wizardTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: c.text,
      marginBottom: 4,
    },
    wizardSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: c.sub,
      marginBottom: 20,
    },
    wizardMethodGrid: {
      gap: 12,
    },
    methodCard: {
      borderWidth: 1,
      borderRadius: 18,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      borderColor: c.border,
    },
    methodIconContainer: {
      width: 46,
      height: 46,
      borderRadius: 23,
      justifyContent: "center",
      alignItems: "center",
    },
    methodInfo: {
      marginLeft: 12,
      flex: 1,
    },
    methodTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
    },
    methodDesc: {
      fontSize: 12,
      marginTop: 2,
      lineHeight: 16,
    },

    // Form inputs
    wizardFormLabel: {
      fontSize: 11,
      fontWeight: "800",
      marginBottom: 6,
      marginTop: 14,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      color: c.sub,
    },
    wizardFormInput: {
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 48,
      fontSize: 14,
      color: c.text,
    },
    wizardFormRow: {
      flexDirection: "row",
      gap: 10,
    },
    wizardFormHalfInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 48,
      fontSize: 14,
      color: c.text,
    },
    formPillGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 8,
    },
    formPillChip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    formPillText: {
      fontSize: 12,
      fontWeight: "700",
    },

    // Quantity Counter Control
    qtyCounterBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      alignItems: "center",
      justifyContent: "center",
    },
    qtyCounterVal: {
      fontSize: 20,
      fontWeight: "800",
      color: c.text,
    },

    // Navigation buttons
    wizardActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 24,
      marginBottom: 20,
    },
    wizardBackBtn: {
      height: 48,
      paddingHorizontal: 22,
      borderRadius: 14,
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
      paddingHorizontal: 22,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
      flex: 1,
      marginLeft: 10,
    },
    wizardNextBtnTxt: {
      color: "#ffffff",
      fontSize: 14,
      fontWeight: "800",
    },

    // General Section Titles & Modals
    sectionTitle: {
      fontSize: 17,
      fontWeight: "800",
      marginTop: 16,
      marginBottom: 10,
      color: c.text,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    modalContent: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      maxHeight: "90%",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    treatmentTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: c.text,
    },
    reorderButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    reorderTxt: {
      color: "#ffffff",
      fontWeight: "800",
      fontSize: 13,
    },
  });
};
