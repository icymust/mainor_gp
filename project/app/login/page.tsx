"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Toast, ToastType } from "../components/Toast";
import { auth, db } from "../lib/firebase";
import { isEekEmail } from "../lib/materials";

const MATERIALS_URL = "/materials";

function redirectToMaterials() {
  window.location.replace(`${window.location.origin}${MATERIALS_URL}`);
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) redirectToMaterials();
    });
    return () => unsubscribe();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!isEekEmail(normalizedEmail)) {
      setToast({
        type: "error",
        message: "Kasuta EEK e-posti kujul eesnimi.perekonnanimi@eek.ee.",
      });
      return;
    }

    if (password.length < 8) {
      setToast({ type: "error", message: "Parool peab olema vähemalt 8 märki." });
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setToast({ type: "error", message: "Paroolid ei klapi." });
      return;
    }

    setLoading(true);
    try {
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        void Promise.allSettled([
          updateProfile(credential.user, {
            displayName: normalizedEmail.split("@")[0].replace(".", " "),
          }),
          setDoc(doc(db, "users", credential.user.uid), {
            email: normalizedEmail,
            displayName: normalizedEmail.split("@")[0],
            role: "student",
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
          }),
        ]);
      } else {
        const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        void Promise.allSettled([
          setDoc(
            doc(db, "users", credential.user.uid),
            { email: normalizedEmail, lastLoginAt: serverTimestamp() },
            { merge: true },
          ),
        ]);
      }
      redirectToMaterials();
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes("auth/invalid-credential")
          ? "E-post või parool ei klapi."
          : "Toiming ebaõnnestus. Kontrolli andmeid ja proovi uuesti.";
      setToast({ type: "error", message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-85px)] bg-[radial-gradient(circle_at_18%_20%,rgba(255,179,26,0.13),transparent_24%),linear-gradient(135deg,#17103A_0%,#070D1C_55%,#151922_100%)] px-4 py-10 text-white">
      <Toast
        open={Boolean(toast)}
        type={toast?.type ?? "info"}
        message={toast?.message ?? ""}
        onClose={() => setToast(null)}
      />
      <section className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#FFB31A]">
            EEK ligipääs
          </p>
          <h1 className="mt-4 text-4xl font-black text-white sm:text-6xl">
            Logi sisse või loo konto
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-white/65">
            Platvorm on mõeldud ülikooli sisemiseks kasutuseks. Konto loomiseks
            sobib ainult EEK e-post kujul eesnimi.perekonnanimi@eek.ee.
          </p>
          <p className="mt-5 max-w-xl rounded-2xl border border-white/12 bg-white/[0.06] p-4 text-base font-semibold leading-7 text-[#FFD56E]">
            Materjalid on nähtavad ainult pärast sisselogimist.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-white/12 bg-white/[0.07] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.34)] backdrop-blur-md"
        >
          <div className="grid grid-cols-2 rounded-full bg-[#0B1022]/80 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setConfirmPassword("");
              }}
              className={`rounded-md px-4 py-2 font-semibold transition ${
                mode === "login" ? "bg-[#FFB31A] text-[#070D1C] shadow-sm" : "text-white/60"
              }`}
            >
              Logi sisse
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`rounded-md px-4 py-2 font-semibold transition ${
                mode === "register" ? "bg-[#FFB31A] text-[#070D1C] shadow-sm" : "text-white/60"
              }`}
            >
              Registreeru
            </button>
          </div>

          <label className="mt-6 block text-sm font-semibold text-white/85" htmlFor="email">
            E-post
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nimi.perekonnanimi@eek.ee"
            className="mt-2 w-full rounded-2xl border border-white/12 bg-[#0B1022]/75 px-4 py-3 text-white outline-none transition placeholder:text-white/32 focus:border-[#FFB31A] focus:ring-2 focus:ring-[#FFB31A]/20"
            required
          />

          <label className="mt-5 block text-sm font-semibold text-white/85" htmlFor="password">
            Parool
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-white/12 bg-[#0B1022]/75 px-4 py-3 text-white outline-none transition focus:border-[#FFB31A] focus:ring-2 focus:ring-[#FFB31A]/20"
            required
            minLength={8}
          />

          {mode === "register" && (
            <>
              <label className="mt-5 block text-sm font-semibold text-white/85" htmlFor="confirmPassword">
                Korda parooli
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/12 bg-[#0B1022]/75 px-4 py-3 text-white outline-none transition focus:border-[#FFB31A] focus:ring-2 focus:ring-[#FFB31A]/20"
                required
                minLength={8}
              />
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-7 w-full rounded-full bg-[#FFB31A] px-5 py-3 font-bold text-[#070D1C] transition hover:bg-[#FFC34D]"
          >
            {loading ? "Palun oota..." : mode === "login" ? "Logi sisse" : "Loo konto"}
          </button>
        </form>
      </section>
    </main>
  );
}
