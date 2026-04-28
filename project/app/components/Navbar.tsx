"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { IconGraduationCap, IconHome, IconList, IconLogin, IconLogout, IconPlus } from "./Icons";

function NavButton({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active
          ? "bg-[#FFB31A] text-[#070D1C] shadow-[0_10px_28px_rgba(255,179,26,0.22)]"
          : "text-[#D8DEE8] hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className="h-5 w-5 shrink-0">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function NavActionButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[#D8DEE8] transition hover:bg-white/10 hover:text-white"
    >
      <span className="h-5 w-5 shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090F20]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-3 font-extrabold tracking-tight text-white transition hover:opacity-90"
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#FFB31A] text-[#070D1C] shadow-[0_14px_35px_rgba(255,179,26,0.25)]">
            <IconGraduationCap />
          </span>
          <span>
            <span className="block text-xs uppercase tracking-[0.32em] text-[#FFB31A]">
              Mainor Share
            </span>
            <span className="block text-lg leading-tight">Õppematerjalid</span>
          </span>
        </Link>

        <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto lg:order-none lg:w-auto">
          <NavButton href="/" label="Avaleht" icon={<IconHome />} />
          <NavButton href="/materials" label="Materjalid" icon={<IconList />} />
          <NavButton href="/add" label="Lisa" icon={<IconPlus />} />
          {user ? (
            <NavActionButton
              label="Välju"
              icon={<IconLogout />}
              onClick={() => signOut(auth)}
            />
          ) : (
            <NavButton href="/login" label="Logi sisse" icon={<IconLogin />} />
          )}
        </nav>

        <div className="hidden w-56 items-center justify-end lg:flex">
          {user?.email && (
            <span className="max-w-full truncate text-right text-sm text-white/70">
              {user.email}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
