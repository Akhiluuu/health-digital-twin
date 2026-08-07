import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { getMedicines } from "../database/medicineDB";

import { log } from "../utils/logger";

const FILE_PATH = (FileSystem.documentDirectory || "") + "medicineData.json";

///////////////////////////////////////////////////////////

export const syncMedicineFile = async () => {
  if (Platform.OS === "web") return;
  try {
    const data = getMedicines();

    await FileSystem.writeAsStringAsync(
      FILE_PATH,
      JSON.stringify(data, null, 2)
    );

    log("Medicine file synced:", FILE_PATH);
  } catch (err) {
    log("File sync error:", err);
  }
};

///////////////////////////////////////////////////////////

export const readMedicineFile = async () => {
  if (Platform.OS === "web") return [];
  try {
    const exists = await FileSystem.getInfoAsync(FILE_PATH);

    if (!exists.exists) return [];

    const content = await FileSystem.readAsStringAsync(FILE_PATH);
    return JSON.parse(content);
  } catch (err) {
    log("Read error:", err);
    return [];
  }
};

///////////////////////////////////////////////////////////

export const getMedicineFilePath = () => FILE_PATH;
