export interface UserProfile {
  inviteCode?: string;

  // Nested structure
  personal: {
    name: string
    email: string
    phone: string
    dob: string
    gender: string
  }

  medical: {
    height: number
    weight: number
    bloodGroup: string
    allergies: string
    medications: string
  }

  habits: {
    wakeUp: string
    breakfast: string
    lunch: string
    dinner: string
    sleep: string
    water: number
    activity: string
  }

  history: {
    diseases: string
    surgeries: string
    familyHistory: string
  }

  emergencyContact?: {
    name?: string;
    phone?: string;
    relation?: string;
  };

  // Flat fields for backward compatibility with existing code
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  height?: string;
  weight?: string;
  allergies?: string[];
  medications?: string[];
  profileImage?: string;

  // BioGears clinical profile fields
  biogears_resting_hr?: number;
  biogears_systolic_bp?: number;
  biogears_diastolic_bp?: number;
  biogears_body_fat?: number;
  biogears_fitness_level?: string;
  biogears_hba1c?: number;
  biogears_vo2max?: number;
  biogears_ethnicity?: string;
  biogears_is_smoker?: boolean;
  biogears_has_anemia?: boolean;
  biogears_has_type1_diabetes?: boolean;
  biogears_has_type2_diabetes?: boolean;
  biogears_registered?: boolean;
}
