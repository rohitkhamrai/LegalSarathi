export type LawyerCategory =
  | "Property"
  | "Criminal"
  | "Family"
  | "Labour"
  | "Consumer"
  | "Women"
  | "Startup"
  | "RTI";

export interface Lawyer {
  id: string;
  name: string;
  specialisations: string[];
  categories: LawyerCategory[];
  fee: number;
  city: string;
  area?: string;
  rating: number;
  reviews: number;
  languages: string[];
  availability: "today" | "tomorrow";
  bio: string;
  barId: string;
  initials: string;
  distanceKm: number;
}

export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export interface SlotInfo { time: string; booked?: boolean }

export const DAY_SLOTS: Record<DayKey, SlotInfo[]> = {
  Mon: [],
  Tue: [],
  Wed: [],
  Thu: [],
  Fri: [],
  Sat: [],
  Sun: [],
};

export const LAWYERS: Lawyer[] = [];
