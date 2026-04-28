"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Toast, ToastType } from "../components/Toast";
import { auth, db } from "../lib/firebase";
import { localMaterialId, saveLocalMaterial } from "../lib/localMaterials";
import { courses, detectFileType, isEekEmail, parseTags, subjects } from "../lib/materials";
import { getSupabase, supabaseBucket } from "../lib/supabase";

function uploadErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "Firebase keelas materjali andmete salvestamise. Kontrolli Firestore rules.";
    }
    return `Firebase viga: ${error.code}`;
  }
  if (error instanceof Error && error.message) {
    if (error.message.includes("403") || error.message.toLowerCase().includes("row-level security")) {
      return "Supabase keelas faili üleslaadimise. Kontrolli Storage bucket policies.";
    }
    if (error.message.includes("timed out")) {
      return "Üleslaadimine aegus. Kontrolli Supabase/Firestore seadistust ja võrguühendust.";
    }
    return error.message;
  }
  return "Üleslaadimine ebaõnnestus. Proovi uuesti.";
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        window.clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
  });
}

async function uploadSupabaseFile(
  file: File,
  storagePath: string,
  onProgress: (progress: number) => void,
) {
  onProgress(15);
  const { error } = await getSupabase().storage.from(supabaseBucket).upload(storagePath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  onProgress(100);
}

export default function AddPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<string>(subjects[0]);
  const [course, setCourse] = useState<string>(courses[0]);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<"idle" | "uploading" | "saving">("idle");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const selectedTags = useMemo(() => parseTags(tags), [tags]);
  const detectedFileType = useMemo(() => (file ? detectFileType(file) : ""), [file]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      setToast({ type: "error", message: "Materjali lisamiseks logi sisse." });
      return;
    }
    if (!user.email || !isEekEmail(user.email)) {
      setToast({ type: "error", message: "Üleslaadimiseks kasuta EEK e-posti kontot." });
      return;
    }
    if (title.trim().length < 3) {
      setToast({ type: "error", message: "Pealkiri peab olema vähemalt 3 märki." });
      return;
    }
    if (description.trim().length < 10) {
      setToast({ type: "error", message: "Kirjeldus peab olema vähemalt 10 märki." });
      return;
    }
    if (!file) {
      setToast({ type: "error", message: "Vali üleslaaditav fail." });
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setToast({ type: "error", message: "Fail võib olla kuni 30 MB." });
      return;
    }
    if (file.size === 0) {
      setToast({ type: "error", message: "Valitud fail on tühi." });
      return;
    }

    setLoading(true);
    setUploadStage("uploading");
    setProgress(1);
    let storagePathForCleanup: string | null = null;
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const materialRef = doc(collection(db, "materials"));
      const storagePath = `materials/${user.uid}/${Date.now()}_${safeName}`;
      const storageProvider = "supabase";
      const normalizedTitle = title.trim();
      const normalizedDescription = description.trim();
      const uploadedFileType = detectFileType(file);

      await uploadSupabaseFile(file, storagePath, setProgress);
      storagePathForCleanup = storagePath;
      setUploadStage("saving");
      await withTimeout(setDoc(materialRef, {
        title: normalizedTitle,
        titleLower: normalizedTitle.toLowerCase(),
        subject,
        course,
        description: normalizedDescription,
        tags: selectedTags,
        fileType: uploadedFileType,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        storagePath,
        storageProvider,
        chunkCount: 0,
        ownerId: user.uid,
        ownerEmail: user.email,
        createdAt: serverTimestamp(),
        searchText: `${normalizedTitle} ${normalizedDescription} ${selectedTags.join(" ")}`.toLowerCase(),
      }), 7000, "Firestore metadata save timed out.");

      setToast({ type: "success", message: "Materjal lisatud." });
      router.push("/materials");
    } catch (error) {
      const normalizedTitle = title.trim();
      const normalizedDescription = description.trim();
      const uploadedFileType = detectFileType(file);
      const fallbackId = localMaterialId();
      try {
        await saveLocalMaterial(
          {
            id: fallbackId,
            title: normalizedTitle,
            subject,
            course,
            description: normalizedDescription,
            tags: selectedTags,
            fileType: uploadedFileType,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || "application/octet-stream",
            storagePath: `local/${user.uid}/${fallbackId}`,
            storageProvider: "local",
            chunkCount: 0,
            ownerId: user.uid,
            ownerEmail: user.email,
            createdAtMs: Date.now(),
            searchText: `${normalizedTitle} ${normalizedDescription} ${selectedTags.join(" ")}`.toLowerCase(),
          },
          file,
        );
        setToast({
          type: "success",
          message: "Firebase ei vastanud, aga fail salvestati selles brauseris ja on allalaaditav.",
        });
        router.push("/materials");
      } catch {
        if (storagePathForCleanup) {
          await getSupabase().storage.from(supabaseBucket).remove([storagePathForCleanup]).catch(() => undefined);
        }
        setToast({ type: "error", message: uploadErrorMessage(error) });
      }
    } finally {
      setLoading(false);
      setUploadStage("idle");
    }
  }

  if (authReady && !user) {
    return (
      <main className="min-h-[calc(100vh-85px)] bg-[#070D1C] px-4 py-10 text-white">
        <div className="mx-auto max-w-2xl rounded-3xl border border-white/12 bg-white/[0.07] p-8 shadow-2xl">
          <h1 className="text-3xl font-black text-white">Logi sisse</h1>
          <p className="mt-3 text-white/65">Materjale saavad lisada ainult EEK kasutajad.</p>
          <Link
            href="/login"
            className="mt-6 inline-flex rounded-full bg-[#FFB31A] px-5 py-3 font-bold text-[#070D1C]"
          >
            Logi sisse
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-85px)] bg-[radial-gradient(circle_at_18%_20%,rgba(255,179,26,0.12),transparent_24%),linear-gradient(135deg,#17103A_0%,#070D1C_55%,#151922_100%)] px-4 py-10 text-white">
      <Toast
        open={Boolean(toast)}
        type={toast?.type ?? "info"}
        message={toast?.message ?? ""}
        onClose={() => setToast(null)}
      />
      <form
        onSubmit={handleSubmit}
        className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr]"
      >
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#FFB31A]">
            Uus materjal
          </p>
          <h1 className="mt-4 text-4xl font-black text-white sm:text-6xl">
            Lisa õppematerjal
          </h1>
          <p className="mt-5 text-lg leading-8 text-white/65">
            Täida metaandmed hoolikalt, et teised leiaksid õige faili kiiresti.
          </p>
        </div>

        <div className="rounded-3xl border border-white/12 bg-white/[0.07] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.34)] backdrop-blur-md">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-white/85">Pealkiri</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/12 bg-[#0B1022]/75 px-4 py-3 text-white outline-none focus:border-[#FFB31A] focus:ring-2 focus:ring-[#FFB31A]/20"
                required
                minLength={3}
                maxLength={120}
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-white/85">Õppeaine</span>
              <select
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/12 bg-[#0B1022]/75 px-4 py-3 text-white outline-none focus:border-[#FFB31A]"
              >
                {subjects.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-white/85">Kursus</span>
              <select
                value={course}
                onChange={(event) => setCourse(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/12 bg-[#0B1022]/75 px-4 py-3 text-white outline-none focus:border-[#FFB31A]"
              >
                {courses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-white/85">Kirjeldus</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-2 min-h-32 w-full rounded-2xl border border-white/12 bg-[#0B1022]/75 px-4 py-3 text-white outline-none focus:border-[#FFB31A] focus:ring-2 focus:ring-[#FFB31A]/20"
                required
                minLength={10}
                maxLength={800}
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-white/85">Märksõnad</span>
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="eksam, loeng, kordamine"
                className="mt-2 w-full rounded-2xl border border-white/12 bg-[#0B1022]/75 px-4 py-3 text-white outline-none placeholder:text-white/32 focus:border-[#FFB31A]"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-white/85">Fail</span>
              <input
                type="file"
                onChange={(event) => {
                  const selectedFile = event.target.files?.[0] ?? null;
                  setFile(selectedFile);
                }}
                className="mt-2 w-full rounded-2xl border border-dashed border-white/20 bg-[#0B1022]/75 px-4 py-5 text-white file:mr-4 file:rounded-full file:border-0 file:bg-[#FFB31A] file:px-4 file:py-2 file:font-bold file:text-[#070D1C]"
                required
              />
              {detectedFileType && (
                <span className="mt-2 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#FFD56E]">
                  {detectedFileType}
                </span>
              )}
            </label>
          </div>

          {selectedTags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedTags.map((tag) => (
                <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#FFD56E]">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {loading && (
            <div className="mt-5">
              <div className="h-2 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full bg-[#FFB31A] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-3 text-sm font-semibold text-white/62">
                {uploadStage === "saving"
                  ? "Salvestan materjali andmeid..."
                  : "Laen faili Supabase Storage keskkonda..."}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-full bg-[#FFB31A] px-5 py-3 font-bold text-[#070D1C] transition hover:bg-[#FFC34D]"
          >
            {loading
              ? uploadStage === "saving"
                ? "Salvestan..."
                : "Laen faili üles..."
              : "Lisa materjal"}
          </button>
        </div>
      </form>
    </main>
  );
}
