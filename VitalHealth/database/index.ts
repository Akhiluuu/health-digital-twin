// database/index.ts
// ─── Canonical single SQLite connection for the entire VitalHealth app ────────
// All database modules import { db } from here instead of calling
// openDatabaseSync on their own.  This means every table lives inside
// one file: vital_health.db — making backup / restore trivially simple.

import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";

class WebSQLiteMock {
  private tables: Record<string, any[]> = {};
  
  constructor() {
    this.loadFromStorage();
  }
  
  private loadFromStorage() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = localStorage.getItem("vital_health_mock_db");
        if (stored) {
          this.tables = JSON.parse(stored);
          return;
        }
      }
      this.resetTables();
    } catch {
      this.resetTables();
    }
  }
  
  private saveToStorage() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem("vital_health_mock_db", JSON.stringify(this.tables));
      }
    } catch (e) {
      console.warn("Failed to save mock db to local storage:", e);
    }
  }
  
  private resetTables() {
    this.tables = {
      db_meta: [],
      medicines: [],
      medicine_history: [],
      hydration: [],
      hydration_history: [],
      symptoms: [],
      history: [],
      user_profile: [],
      simulation_history: [],
      cognitive_sessions: [],
      backup_meta: [],
      notifications: [],
      notification_preferences: [],
      pie_persona: [],
      pie_audit_log: [],
      pie_interaction_signals: [],
      pie_rule_state: [],
      pie_brief_state: [],
      vitals_log: []
    };
  }

  execSync(sql: string) {
    return;
  }
  
  execAsync(sql: string) {
    return Promise.resolve();
  }
  
  runSync(sql: string, params: any[] = []) {
    this.handleWrite(sql, params);
    return { changes: 1, lastInsertRowId: Date.now() };
  }
  
  runAsync(sql: string, params: any[] = []) {
    this.handleWrite(sql, params);
    return Promise.resolve({ changes: 1, lastInsertRowId: Date.now() });
  }
  
  getFirstSync<T>(sql: string, params: any[] = []): T | null {
    const results = this.handleRead<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }
  
  getFirstAsync<T>(sql: string, params: any[] = []): Promise<T | null> {
    const res = this.getFirstSync<T>(sql, params);
    return Promise.resolve(res);
  }
  
  getAllSync<T>(sql: string, params: any[] = []): T[] {
    return this.handleRead<T>(sql, params);
  }
  
  getAllAsync<T>(sql: string, params: any[] = []): Promise<T[]> {
    const res = this.getAllSync<T>(sql, params);
    return Promise.resolve(res);
  }
  
  private handleWrite(sql: string, params: any[]) {
    const sqlLower = sql.toLowerCase();
    
    // User profile
    if (sqlLower.includes("insert into user_profile") || sqlLower.includes("insert or replace into user_profile") || sqlLower.includes("replace into user_profile")) {
      const profile = {
        uid: params[0],
        firstName: params[1],
        lastName: params[2],
        inviteCode: params[3],
        bloodGroup: params[4],
        gender: params[5],
        dateOfBirth: params[6],
        height: params[7],
        weight: params[8],
        phone: params[9],
        profileImage: params[10],
        registered_at: params[11],
        biogears_registered: params[12] ?? 0,
        biogears_user_id: params[13] ?? null
      };
      const idx = this.tables.user_profile.findIndex(p => p.uid === profile.uid);
      if (idx >= 0) {
        this.tables.user_profile[idx] = profile;
      } else {
        this.tables.user_profile.push(profile);
      }
    } else if (sqlLower.includes("update user_profile")) {
      if (this.tables.user_profile.length > 0) {
        const profile = this.tables.user_profile[0];
        if (sqlLower.includes("biogears_registered") && sqlLower.includes("biogears_user_id")) {
          profile.biogears_registered = params[0];
          profile.biogears_user_id = params[1];
        }
      }
    } else if (sqlLower.includes("delete from user_profile")) {
      this.tables.user_profile = [];
    }
    
    // Medicines
    else if (sqlLower.includes("insert or replace into medicines") || sqlLower.includes("insert into medicines")) {
      if (sqlLower.includes("insert or replace into medicines")) {
        const m = {
          id: params[0],
          name: params[1],
          dose: params[2],
          type: params[3],
          time: params[4],
          timestamp: params[5],
          meal: params[6],
          frequency: params[7],
          startDate: params[8],
          endDate: params[9],
          reminder: params[10],
          notificationId: params[11],
          taken: params[12] ?? 0,
          takenDate: params[13] ?? null,
        };
        const idx = this.tables.medicines.findIndex(x => x.id === m.id);
        if (idx >= 0) this.tables.medicines[idx] = m;
        else this.tables.medicines.push(m);
      } else {
        const m = {
          id: Date.now(),
          name: params[0],
          dose: params[1],
          type: params[2],
          time: params[3],
          timestamp: params[4],
          meal: params[5],
          frequency: params[6],
          startDate: params[7],
          endDate: params[8],
          reminder: params[9],
          notificationId: params[10],
          taken: 0,
          takenDate: null,
        };
        this.tables.medicines.push(m);
      }
    } else if (sqlLower.includes("update medicines")) {
      if (sqlLower.includes("taken = 1")) {
        const today = params[0];
        const id = params[1];
        const med = this.tables.medicines.find(m => m.id == id);
        if (med) {
          med.taken = 1;
          med.takenDate = today;
        }
      } else if (sqlLower.includes("taken = -1")) {
        const today = params[0];
        const id = params[1];
        const med = this.tables.medicines.find(m => m.id == id);
        if (med) {
          med.taken = -1;
          med.takenDate = today;
        }
      } else if (sqlLower.includes("taken = 0")) {
        const id = params[0];
        const med = this.tables.medicines.find(m => m.id == id);
        if (med) {
          med.taken = 0;
          med.takenDate = null;
        }
      }
    } else if (sqlLower.includes("delete from medicines")) {
      if (sqlLower.includes("where id = ?")) {
        const id = params[0];
        this.tables.medicines = this.tables.medicines.filter(m => m.id != id);
      } else {
        this.tables.medicines = [];
      }
    }
    
    // Hydration
    else if (sqlLower.includes("insert or replace into hydration")) {
      const entry = { date: params[0], amount: params[1] };
      const idx = this.tables.hydration.findIndex(h => h.date === entry.date);
      if (idx >= 0) this.tables.hydration[idx] = entry;
      else this.tables.hydration.push(entry);
    } else if (sqlLower.includes("insert into hydration_history")) {
      const entry = {
        id: Date.now(),
        amount: params[0],
        total: params[1],
        timestamp: params[2],
        source: params[3] || 'manual'
      };
      this.tables.hydration_history.push(entry);
    }
    
    // Symptoms
    else if (sqlLower.includes("insert into symptoms")) {
      const entry = {
        id: Date.now(),
        categoryId: params[0],
        optionId: params[1],
        name: params[2],
        severity: params[3],
        startedAt: params[4],
        notes: params[5],
        active: 1,
        resolvedAt: null,
        followupTime: null,
        followUpAnswers: null
      };
      this.tables.symptoms.push(entry);
    } else if (sqlLower.includes("update symptoms")) {
      if (sqlLower.includes("resolvedat")) {
        const resolvedAt = params[0];
        const id = params[1];
        const sym = this.tables.symptoms.find(s => s.id == id);
        if (sym) {
          sym.resolvedAt = resolvedAt;
          sym.active = 0;
        }
      }
    }
    
    // DB Meta
    else if (sqlLower.includes("insert or replace into db_meta")) {
      const entry = { key: params[0], value: params[1] };
      const idx = this.tables.db_meta.findIndex(m => m.key === entry.key);
      if (idx >= 0) this.tables.db_meta[idx] = entry;
      else this.tables.db_meta.push(entry);
    }
    
    // PIE Tables
    else if (sqlLower.includes("insert or replace into pie_persona")) {
      const entry = {
        uid: params[0],
        archetypes_json: params[1],
        primary_archetype: params[2],
        age_years: params[3],
        gender: params[4],
        conditions_json: params[5],
        medication_adherence_rate: params[6],
        avg_daily_steps: params[7],
        avg_hydration_ml: params[8],
        last_simulation_at: params[9],
        last_cognitive_at: params[10],
        last_med_log_at: params[11],
        last_active_at: params[12],
        notification_open_rate: params[13],
        avg_response_delay_ms: params[14],
        computed_at: params[15]
      };
      const idx = this.tables.pie_persona.findIndex(x => x.uid === entry.uid);
      if (idx >= 0) this.tables.pie_persona[idx] = entry;
      else this.tables.pie_persona.push(entry);
    } else if (sqlLower.includes("insert or replace into pie_brief_state")) {
      const entry = {
        profile_id: params[0],
        brief_type: params[1],
        sent_at: params[2]
      };
      const idx = this.tables.pie_brief_state.findIndex(x => x.profile_id === entry.profile_id && x.brief_type === entry.brief_type);
      if (idx >= 0) this.tables.pie_brief_state[idx] = entry;
      else this.tables.pie_brief_state.push(entry);
    }
    else if (sqlLower.includes("insert into vitals_log") || sqlLower.includes("insert or replace into vitals_log") || sqlLower.includes("replace into vitals_log")) {
      const record = {
        id: params[0],
        timestamp: params[1],
        date: params[2],
        time: params[3],
        member_id: params[4] || "self",
        heartRate: params[5],
        bpSystolic: params[6],
        bpDiastolic: params[7],
        spo2: params[8],
        temperature: params[9],
        respiratoryRate: params[10],
        weight: params[11],
        bloodGlucose: params[12],
        feeling: params[13],
        medicationTaken: params[14],
        notes: params[15]
      };
      const idx = this.tables.vitals_log.findIndex((x: any) => x.id === record.id);
      if (idx >= 0) this.tables.vitals_log[idx] = record;
      else this.tables.vitals_log.push(record);
    }
    else if (sqlLower.includes("update vitals_log")) {
      const record = {
        date: params[0],
        time: params[1],
        member_id: params[2] || "self",
        heartRate: params[3],
        bpSystolic: params[4],
        bpDiastolic: params[5],
        spo2: params[6],
        temperature: params[7],
        respiratoryRate: params[8],
        weight: params[9],
        bloodGlucose: params[10],
        feeling: params[11],
        medicationTaken: params[12],
        notes: params[13],
        id: params[14]
      };
      const idx = this.tables.vitals_log.findIndex((x: any) => x.id === record.id);
      if (idx >= 0) {
        this.tables.vitals_log[idx] = { ...this.tables.vitals_log[idx], ...record };
      }
    }
    else if (sqlLower.includes("delete from vitals_log")) {
      if (sqlLower.includes("where id = ?")) {
        const id = params[0];
        this.tables.vitals_log = this.tables.vitals_log.filter((x: any) => x.id != id);
      } else {
        this.tables.vitals_log = [];
      }
    }
    
    // General clear
    else if (sqlLower.includes("delete from") && !sqlLower.includes("where")) {
      if (sqlLower.includes("medicines")) this.tables.medicines = [];
      if (sqlLower.includes("medicine_history")) this.tables.medicine_history = [];
      if (sqlLower.includes("hydration")) this.tables.hydration = [];
      if (sqlLower.includes("hydration_history")) this.tables.hydration_history = [];
      if (sqlLower.includes("symptoms")) this.tables.symptoms = [];
      if (sqlLower.includes("history")) this.tables.history = [];
      if (sqlLower.includes("user_profile")) this.tables.user_profile = [];
      if (sqlLower.includes("simulation_history")) this.tables.simulation_history = [];
      if (sqlLower.includes("vitals_log")) this.tables.vitals_log = [];
    }
    
    this.saveToStorage();
  }
  
  private handleRead<T>(sql: string, params: any[]): T[] {
    const sqlLower = sql.toLowerCase();
    
    if (sqlLower.includes("select * from user_profile")) {
      if (sqlLower.includes("where uid = ?")) {
        const uid = params[0];
        return this.tables.user_profile.filter(p => p.uid === uid) as unknown as T[];
      }
      return this.tables.user_profile as unknown as T[];
    } else if (sqlLower.includes("select * from medicines")) {
      return this.tables.medicines as unknown as T[];
    } else if (sqlLower.includes("select * from hydration_history")) {
      return this.tables.hydration_history as unknown as T[];
    } else if (sqlLower.includes("select * from hydration")) {
      if (sqlLower.includes("where date = ?")) {
        const date = params[0];
        return this.tables.hydration.filter(h => h.date === date) as unknown as T[];
      }
      return this.tables.hydration as unknown as T[];
    } else if (sqlLower.includes("select * from symptoms")) {
      if (sqlLower.includes("where active = 1")) {
        return this.tables.symptoms.filter(s => s.active === 1) as unknown as T[];
      }
      return this.tables.symptoms as unknown as T[];
    } else if (sqlLower.includes("select * from pie_persona")) {
      const uid = params[0];
      return this.tables.pie_persona.filter(x => x.uid === uid) as unknown as T[];
    } else if (sqlLower.includes("select sent_at from pie_brief_state")) {
      const profile_id = params[0];
      const brief_type = params[1];
      return this.tables.pie_brief_state.filter(x => x.profile_id === profile_id && x.brief_type === brief_type) as unknown as T[];
    } else if (sqlLower.includes("select * from vitals_log")) {
      if (sqlLower.includes("where id = ?")) {
        const id = params[0];
        return this.tables.vitals_log.filter((x: any) => x.id == id) as unknown as T[];
      }
      if (sqlLower.includes("where member_id = ?")) {
        const mId = params[0] || "self";
        return [...this.tables.vitals_log]
          .filter((x: any) => x.member_id === mId || (!x.member_id && mId === "self"))
          .sort((a: any, b: any) => b.timestamp - a.timestamp) as unknown as T[];
      }
      return [...this.tables.vitals_log].sort((a: any, b: any) => b.timestamp - a.timestamp) as unknown as T[];
    } else if (sqlLower.includes("select * from db_meta")) {
      return this.tables.db_meta as unknown as T[];
    } else if (sqlLower.includes("select count(*)")) {
      if (sqlLower.includes("medicines")) {
        return [{ count: this.tables.medicines.length }] as unknown as T[];
      }
    }
    
    return [] as unknown as T[];
  }
}

export const db = Platform.OS === "web"
  ? (new WebSQLiteMock() as any)
  : SQLite.openDatabaseSync("vital_health.db");

try {
  if (Platform.OS !== "web") {
    db.execSync("PRAGMA busy_timeout = 30000;");
  }
} catch (e) {
  console.warn("⚠️ Failed to set busy_timeout on vital_health.db:", e);
}

export const run = (sql: string, params: any[] = []) => db.runAsync(sql, params);
export const get = (sql: string, params: any[] = []) => db.getFirstAsync(sql, params);
export const all = (sql: string, params: any[] = []) => db.getAllAsync(sql, params);

