"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { IconDownload, IconSearch, IconTrash } from "../components/Icons";
import { Toast, ToastType } from "../components/Toast";
import { auth, db } from "../lib/firebase";
import { deleteLocalMaterial, downloadLocalMaterial, getLocalMaterials } from "../lib/localMaterials";
import { courses, fileTypes, formatBytes, Material, subjects } from "../lib/materials";
import { getSupabase, supabaseBucket } from "../lib/supabase";

function mapMaterial(snapshot: QueryDocumentSnapshot): Material {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    title: String(data.title ?? ""),
    subject: String(data.subject ?? ""),
    course: String(data.course ?? ""),
    description: String(data.description ?? ""),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    fileType: String(data.fileType ?? "Other"),
    fileName: String(data.fileName ?? ""),
    fileSize: Number(data.fileSize ?? 0),
    mimeType: String(data.mimeType ?? ""),
    storagePath: String(data.storagePath ?? ""),
    storageProvider:
      data.storageProvider === "firestore" || data.storageProvider === "supabase"
        ? data.storageProvider
        : "storage",
    chunkCount: Number(data.chunkCount ?? 0),
    ownerId: String(data.ownerId ?? ""),
    ownerEmail: String(data.ownerEmail ?? ""),
    createdAt: data.createdAt,
    searchText: String(data.searchText ?? ""),
  };
}

function firebaseLoadErrorMessage(error: unknown, hasLocalMaterials: boolean) {
  const fallbackMessage = hasLocalMaterials
    ? "Näitan selles brauseris salvestatud materjale."
    : "Kohalikke materjale ei leitud.";

  if (error instanceof FirebaseError) {
    return `Firebase ei vastanud (${error.code}). ${fallbackMessage}`;
  }

  if (error instanceof Error && error.message) {
    return `Firebase ei vastanud (${error.message}). ${fallbackMessage}`;
  }

  return `Firebase ei vastanud. ${fallbackMessage}`;
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

export default function MaterialsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState("");
  const [subject, setSubject] = useState("Kõik");
  const [course, setCourse] = useState("Kõik");
  const [fileType, setFileType] = useState("Kõik");
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        window.location.replace("/login");
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;

    async function loadMaterials() {
      setLoading(true);
      const localMaterials = await getLocalMaterials().catch(() => []);
      if (localMaterials.length > 0) {
        setMaterials(localMaterials);
      }

      try {
        const snapshot = await withTimeout(
          getDocs(query(collection(db, "materials"), orderBy("createdAt", "desc"))),
          30000,
          "Firestore load timed out.",
        );
        const remoteMaterials = snapshot.docs.map(mapMaterial);
        const remoteIds = new Set(remoteMaterials.map((item) => item.id));
        setMaterials([
          ...localMaterials.filter((item) => !remoteIds.has(item.id)),
          ...remoteMaterials,
        ]);
      } catch (error) {
        if (localMaterials.length === 0) {
          setMaterials([]);
        }
        setToast({
          type: localMaterials.length === 0 ? "error" : "info",
          message: firebaseLoadErrorMessage(error, localMaterials.length > 0),
        });
      } finally {
        setLoading(false);
      }
    }
    loadMaterials();
  }, [authReady, user]);

  const filteredMaterials = useMemo(() => {
    const search = queryText.trim().toLowerCase();
    return materials.filter((material) => {
      const matchesText =
        !search ||
        material.searchText.includes(search) ||
        material.title.toLowerCase().includes(search) ||
        material.description.toLowerCase().includes(search) ||
        material.tags.some((tag) => tag.includes(search));
      const matchesSubject = subject === "Kõik" || material.subject === subject;
      const matchesCourse = course === "Kõik" || material.course === course;
      const matchesType = fileType === "Kõik" || material.fileType === fileType;
      return matchesText && matchesSubject && matchesCourse && matchesType;
    });
  }, [course, fileType, materials, queryText, subject]);

  async function downloadMaterial(material: Material) {
    if (!user) {
      setToast({ type: "error", message: "Allalaadimiseks logi sisse." });
      return;
    }

    try {
      if (material.storageProvider === "local") {
        await downloadLocalMaterial(material);
        return;
      }

      if (material.storageProvider === "firestore") {
        const chunksSnapshot = await getDocs(
          query(collection(db, "materials", material.id, "chunks"), orderBy("index", "asc")),
        );
        const base64Data = chunksSnapshot.docs
          .map((chunkDoc) => String(chunkDoc.data().data ?? ""))
          .join("");
        const byteCharacters = atob(base64Data);
        const byteNumbers = Array.from(byteCharacters, (character) => character.charCodeAt(0));
        const blob = new Blob([new Uint8Array(byteNumbers)], {
          type: material.mimeType || "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = material.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return;
      }

      if (material.storageProvider === "supabase") {
        const { data } = getSupabase().storage
          .from(supabaseBucket)
          .getPublicUrl(material.storagePath);
        window.open(data.publicUrl, "_blank", "noopener,noreferrer");
        return;
      }

      throw new Error("Unsupported storage provider.");
    } catch {
      setToast({ type: "error", message: "Faili linki ei õnnestunud avada." });
    }
  }

  async function deleteMaterial(material: Material) {
    if (user?.uid !== material.ownerId) {
      setToast({ type: "error", message: "Saad kustutada ainult enda materjale." });
      return;
    }

    const confirmed = window.confirm(`Kustutada "${material.title}"?`);
    if (!confirmed) return;

    try {
      if (material.storageProvider === "firestore") {
        const chunksSnapshot = await getDocs(collection(db, "materials", material.id, "chunks"));
        await Promise.all(chunksSnapshot.docs.map((chunkDoc) => deleteDoc(chunkDoc.ref)));
      } else if (material.storageProvider === "local") {
        await deleteLocalMaterial(material.id);
      } else if (material.storageProvider === "supabase") {
        await getSupabase().storage.from(supabaseBucket).remove([material.storagePath]).catch(() => undefined);
      } else {
        throw new Error("Unsupported storage provider.");
      }
      if (material.storageProvider !== "local") {
        await deleteDoc(doc(db, "materials", material.id));
      }
      setMaterials((current) => current.filter((item) => item.id !== material.id));
      setToast({ type: "success", message: "Materjal kustutatud." });
    } catch {
      setToast({ type: "error", message: "Kustutamine ebaõnnestus." });
    }
  }

  return (
    <main className="min-h-[calc(100vh-85px)] bg-[radial-gradient(circle_at_18%_20%,rgba(255,179,26,0.12),transparent_24%),linear-gradient(135deg,#17103A_0%,#070D1C_55%,#151922_100%)] px-4 py-10 text-white">
      <Toast
        open={Boolean(toast)}
        type={toast?.type ?? "info"}
        message={toast?.message ?? ""}
        onClose={() => setToast(null)}
      />
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#FFB31A]">
              Õppematerjalid
            </p>
            <h1 className="mt-3 text-4xl font-black text-white sm:text-6xl">
              Materjalide kogu
            </h1>
          </div>
          <p className="text-sm font-semibold text-white/62">
            {filteredMaterials.length} / {materials.length} materjali
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-white/12 bg-white/[0.07] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.24)] backdrop-blur-md">
          <div className="grid gap-3 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
            <label className="relative block">
              <span className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#FFB31A]">
                <IconSearch />
              </span>
              <input
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
                placeholder="Otsi pealkirja, kirjelduse või märksõna järgi"
                className="w-full rounded-2xl border border-white/12 bg-[#0B1022]/75 py-3 pl-11 pr-4 text-white outline-none placeholder:text-white/35 focus:border-[#FFB31A] focus:ring-2 focus:ring-[#FFB31A]/20"
              />
            </label>

            <select
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="rounded-2xl border border-white/12 bg-[#0B1022]/75 px-4 py-3 text-white outline-none focus:border-[#FFB31A]"
            >
              <option>Kõik</option>
              {subjects.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>

            <select
              value={course}
              onChange={(event) => setCourse(event.target.value)}
              className="rounded-2xl border border-white/12 bg-[#0B1022]/75 px-4 py-3 text-white outline-none focus:border-[#FFB31A]"
            >
              <option>Kõik</option>
              {courses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>

            <select
              value={fileType}
              onChange={(event) => setFileType(event.target.value)}
              className="rounded-2xl border border-white/12 bg-[#0B1022]/75 px-4 py-3 text-white outline-none focus:border-[#FFB31A]"
            >
              <option>Kõik</option>
              {fileTypes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {loading ? (
            <div className="rounded-3xl border border-white/12 bg-white/[0.07] p-8 text-white/62 shadow-sm">
              Laen materjale...
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="rounded-3xl border border-white/12 bg-white/[0.07] p-8 text-white/62 shadow-sm">
              Ühtegi sobivat materjali ei leitud.
            </div>
          ) : (
            filteredMaterials.map((material) => (
              <article
                key={material.id}
                className="rounded-3xl border border-white/12 bg-white/[0.07] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.18)] backdrop-blur-md"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#4A3F37] px-3 py-1 text-xs font-bold text-[#FFB31A]">
                        {material.fileType}
                      </span>
                      <span className="text-sm text-white/52">{formatBytes(material.fileSize)}</span>
                    </div>
                    <h2 className="mt-3 text-xl font-black text-white">{material.title}</h2>
                    <p className="mt-2 max-w-4xl leading-7 text-white/64">{material.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-sm">
                      <span className="font-semibold text-[#FFD56E]">{material.subject}</span>
                      <span className="text-white/30">/</span>
                      <span className="font-semibold text-white/80">{material.course}</span>
                      <span className="text-white/30">/</span>
                      <span className="truncate text-white/52">{material.fileName}</span>
                    </div>
                    {material.tags.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {material.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-[#0B1022]/75 px-3 py-1 text-xs font-semibold text-white/62">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => downloadMaterial(material)}
                      className="inline-flex items-center gap-2 rounded-full bg-[#FFB31A] px-4 py-2 text-sm font-bold text-[#070D1C] transition hover:bg-[#FFC34D]"
                    >
                      <IconDownload />
                      Laadi alla
                    </button>
                    {user?.uid === material.ownerId && (
                      <button
                        type="button"
                        onClick={() => deleteMaterial(material)}
                        className="inline-flex items-center gap-2 rounded-full border border-red-300/40 px-4 py-2 text-sm font-bold text-red-200 transition hover:bg-red-500/20"
                        aria-label="Kustuta materjal"
                      >
                        <IconTrash />
                        Kustuta
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
