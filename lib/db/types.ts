// Shared types for the SQLite data layer.
// Task 4 (question authoring) and Task 6 (quiz) import BlueprintCategory / BLUEPRINT from here.

export type BlueprintCategory =
  | "scientific_knowledge"
  | "patient_assessment"
  | "treatment_planning"
  | "health_safety"
  | "emergencies"
  | "prevention_population"
  | "pain_anxiety"
  | "periodontics"
  | "pediatric"
  | "orthodontics"
  | "restorative_endodontics"
  | "prosthodontics"
  | "oral_surgery_medicine"
  | "affective_skills";

/** Authoritative blueprint weighting: exam item counts per category. Sums to 150. */
export const BLUEPRINT: { category: BlueprintCategory; examCount: number }[] = [
  { category: "scientific_knowledge", examCount: 35 },
  { category: "patient_assessment", examCount: 10 },
  { category: "treatment_planning", examCount: 6 },
  { category: "health_safety", examCount: 6 },
  { category: "emergencies", examCount: 6 },
  { category: "prevention_population", examCount: 6 },
  { category: "pain_anxiety", examCount: 5 },
  { category: "periodontics", examCount: 10 },
  { category: "pediatric", examCount: 10 },
  { category: "orthodontics", examCount: 5 },
  { category: "restorative_endodontics", examCount: 16 },
  { category: "prosthodontics", examCount: 10 },
  { category: "oral_surgery_medicine", examCount: 10 },
  { category: "affective_skills", examCount: 15 },
];

/** Human-readable display names for the 14 blueprint categories. */
export const CATEGORY_LABELS: Record<BlueprintCategory, string> = {
  scientific_knowledge: "Scientific Knowledge",
  patient_assessment: "Patient Assessment & Diagnosis",
  treatment_planning: "Treatment Planning",
  health_safety: "Health & Safety",
  emergencies: "Management of Emergencies",
  prevention_population: "Prevention & Population Health",
  pain_anxiety: "Pain & Anxiety Control",
  periodontics: "Periodontics",
  pediatric: "Pediatric Dentistry",
  orthodontics: "Orthodontics",
  restorative_endodontics: "Restorative & Endodontics",
  prosthodontics: "Prosthodontics",
  oral_surgery_medicine: "Oral Surgery & Medicine",
  affective_skills: "Affective Skills",
};

export interface Chunk {
  id: string;
  book: string;
  page_start: number;
  page_end: number;
  category_hint: string;
  text: string;
}

export interface Question {
  id: number;
  category: BlueprintCategory;
  stem: string;
  choices: string[];
  correct_index: number;
  explanation: string | null;
  source_chunk_id: string | null;
  created_at: string;
}

export interface NewQuestion {
  category: BlueprintCategory;
  stem: string;
  choices: string[];
  correct_index: number;
  explanation?: string | null;
  source_chunk_id?: string | null;
}

export interface QuestionFilter {
  category?: BlueprintCategory;
  limit?: number;
}

/**
 * How a quiz attempt was started. Single source of truth shared by the API,
 * the session page, and the data layer so the union can't drift out of sync.
 * Only GRADED_MODES feed the dashboard; "completed" is pure re-reading.
 */
export type QuizMode = "full" | "topic" | "review" | "completed";

/** Modes whose answers count toward the dashboard trend and category stats. */
export const GRADED_MODES: QuizMode[] = ["full", "topic", "review"];

export interface Attempt {
  id: number;
  mode: QuizMode;
  started_at: string;
  completed_at: string | null;
}

export interface NewAnswer {
  attempt_id: number;
  question_id: number;
  selected_index: number;
  is_correct: boolean;
}

export interface Answer {
  id: number;
  attempt_id: number;
  question_id: number;
  selected_index: number;
  is_correct: boolean;
  answered_at: string;
}

export interface CategoryStat {
  category: BlueprintCategory;
  attempted: number;
  correct: number;
  accuracy: number; // correct / attempted, 0 when attempted === 0
}

/** One completed quiz attempt's score, for the dashboard trend line. */
export interface AttemptScore {
  attempt_id: number;
  completed_at: string | null;
  total: number;
  correct: number;
  pct: number; // correct / total * 100, rounded; 0 when total === 0
}

export interface ChatMessage {
  id: number;
  session: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface NewChatMessage {
  session: string;
  role: "user" | "assistant";
  content: string;
}
