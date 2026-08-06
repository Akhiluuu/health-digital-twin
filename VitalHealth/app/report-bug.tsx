// app/report-bug.tsx

import React from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import BugReportModal from "../components/BugReportModal";
import { BugCategory } from "../services/bugReportService";

export default function ReportBugScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const category = (params.category as BugCategory) || "ui";
  const stackTrace = params.stackTrace ? String(params.stackTrace) : undefined;

  return (
    <BugReportModal
      visible={true}
      onClose={() => router.back()}
      initialCategory={category}
      initialStackTrace={stackTrace}
    />
  );
}
