import { Timestamp } from "firebase/firestore";

export const subjects = [
  "Ettevõtlus",
  "Finantsjuhtimine",
  "Infotehnoloogia",
  "Juhtimine",
  "Keeled",
  "Majandus",
  "Marketing",
  "Õigus",
] as const;

export const courses = [
  "1. kursus",
  "2. kursus",
  "3. kursus",
  "Magistriõpe",
  "Valikained",
] as const;

export const fileTypes = ["PDF", "DOC/DOCX", "PPT/PPTX", "XLS/XLSX", "Image", "Other"] as const;

export type Material = {
  id: string;
  title: string;
  subject: string;
  course: string;
  description: string;
  tags: string[];
  fileType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  storageProvider?: "storage" | "firestore" | "supabase" | "local";
  chunkCount?: number;
  ownerId: string;
  ownerEmail: string;
  createdAt?: Timestamp;
  searchText: string;
};

export function isEekEmail(email: string) {
  return /^[a-zA-ZÀ-ž-]+\.[a-zA-ZÀ-ž-]+@eek\.ee$/i.test(email.trim());
}

export function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

export function detectFileType(file: File) {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  if (/\.(doc|docx)$/.test(name)) return "DOC/DOCX";
  if (/\.(ppt|pptx)$/.test(name)) return "PPT/PPTX";
  if (/\.(xls|xlsx)$/.test(name)) return "XLS/XLSX";
  if (file.type.startsWith("image/")) return "Image";
  return "Other";
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
