"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { collection, deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { Toast, ToastType } from "../components/Toast";
import { auth, db, storage } from "../lib/firebase";
import { localMaterialId, saveLocalMaterial } from "../lib/localMaterials";
import { courses, detectFileType, isEekEmail, parseTags, subjects } from "../lib/materials";

function uploadErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "storage/unauthorized" || error.code === "permission-denied") {
      return "Firebase keelas üleslaadimise. Kontrolli, et oled EEK kontoga sisse logitud ja Firebase rules on deployitud.";
    }
    if (error.code === "storage/canceled") return "Üleslaadimine katkestati.";
    if (error.code === "storage/retry-limit-exceeded") {
      return "Võrguühendus katkestas üleslaadimise. Proovi uuesti väiksema failiga.";
    }
    if (error.code === "storage/bucket-not-found") {
      return "Firebase Storage bucketit ei leitud. Kontrolli Firebase projekti seadistust.";
    }
    return `Firebase viga: ${error.code}`;
  }
  if (error instanceof Error && error.message) {
    if (error.message.includes("storage/unauthorized") || error.message.includes("403")) {
      return "Firebase keelas üleslaadimise. Kontrolli, et Storage on enabled ja storage.rules on deployitud.";
    }
    if (error.message.includes("timed out")) {
      return "Üleslaadimine aegus. Kontrolli Firebase Storage seadistust ja võrguühendust.";
    }
    return error.message;
  }
  return "Üleslaadimine ebaõnnestus. Proovi uuesti.";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Faili lugemine ebaõnnestus."));
    reader.readAsDataURL(file);
  });
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

async function uploadFileWithTimeout(
  file: File,
  user: User,
  storagePath: string,
  onProgress: (progress: number) => void,
) {
  const bucket = storage.app.options.storageBucket;
  if (!bucket) throw new Error("Firebase Storage bucket is missing from config.");

  const token = await user.getIdToken();
  const encodedPath = encodeURIComponent(storagePath);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedPath}`;

  async function sendUpload(authHeader: string) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.timeout = 60000;
      xhr.setRequestHeader("Authorization", authHeader);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(Math.min(95, Math.max(15, Math.round((event.loaded / event.total) * 95))));
        } else {
          onProgress(35);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve();
          return;
        }

        reject(
          new Error(
            `storage/upload-failed (${xhr.status}): ${xhr.responseText || xhr.statusText}`,
          ),
        );
      };

      xhr.onerror = () => reject(new Error("storage/network-error: Firebase Storage request failed."));
      xhr.ontimeout = () => reject(new Error("storage/timed-out: Firebase Storage did not finish within 60 seconds."));
      xhr.send(file);
    });
  }

  onProgress(15);
  try {
    await sendUpload(`Firebase ${token}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("(401)") && !message.includes("(403)")) throw error;
    await sendUpload(`Bearer ${token}`);
  }
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
    let createdMaterialId: string | null = null;
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const materialRef = doc(collection(db, "materials"));
      createdMaterialId = materialRef.id;
      let storagePath = `materials/${user.uid}/${Date.now()}_${safeName}`;
      let storageProvider: "storage" | "firestore" = "storage";
      let chunkCount = 0;
      const normalizedTitle = title.trim();
      const normalizedDescription = description.trim();
      const uploadedFileType = detectFileType(file);

      try {
        await uploadFileWithTimeout(file, user, storagePath, setProgress);
        storagePathForCleanup = storagePath;
      } catch (storageError) {
        storageProvider = "firestore";
        storagePath = `firestore/${user.uid}/${materialRef.id}`;
        const dataUrl = await readFileAsDataUrl(file);
        const [, base64Data = ""] = dataUrl.split(",");
        const chunkSize = 650_000;
        chunkCount = Math.ceil(base64Data.length / chunkSize);

        for (let index = 0; index < chunkCount; index += 1) {
          const start = index * chunkSize;
          const chunk = base64Data.slice(start, start + chunkSize);
          await withTimeout(
            setDoc(doc(db, "materials", materialRef.id, "chunks", String(index).padStart(5, "0")), {
              data: chunk,
              index,
              ownerId: user.uid,
            }),
            7000,
            "Firestore chunk save timed out.",
          );
          setProgress(Math.min(95, Math.round(((index + 1) / chunkCount) * 95)));
        }

        if (chunkCount === 0) throw storageError;
      }
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
        chunkCount,
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
          await deleteObject(ref(storage, storagePathForCleanup)).catch(() => undefined);
        }
        if (createdMaterialId) {
          for (let index = 0; index < 80; index += 1) {
            await deleteDoc(
              doc(db, "materials", createdMaterialId, "chunks", String(index).padStart(5, "0")),
            ).catch(() => undefined);
          }
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
                  : "Laen faili Firebase Storage keskkonda..."}
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
