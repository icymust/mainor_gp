import Link from "next/link";
import { IconCheck, IconDownload, IconGraduationCap, IconList } from "./components/Icons";

export default function HomePage() {
  return (
    <main className="min-h-[calc(100vh-85px)] overflow-hidden bg-[radial-gradient(circle_at_18%_25%,rgba(255,179,26,0.12),transparent_24%),radial-gradient(circle_at_78%_38%,rgba(85,68,191,0.2),transparent_32%),linear-gradient(135deg,#17103A_0%,#070D1C_42%,#151922_100%)]">
      <section className="mx-auto max-w-7xl px-4 pb-12 pt-6 lg:pb-20 lg:pt-10">
        <div>
          <div className="inline-flex items-center gap-3 rounded-full bg-[#3A2F2B]/90 px-5 py-3 text-sm font-bold text-[#FFD56E] shadow-[0_12px_35px_rgba(0,0,0,0.25)]">
            <span className="h-5 w-5">
              <IconGraduationCap />
            </span>
            Privaatne platvorm ülikooli tudengitele
          </div>

          <h1 className="mt-10 w-full text-5xl font-black leading-[1.08] text-white sm:text-7xl lg:text-8xl">
            Jaga õppematerjale turvaliselt, kiiresti ja kaasaegses keskkonnas.
          </h1>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["6", "materjali saadaval", <IconList key="list" />],
            ["460", "allalaadimist tehtud", <IconDownload key="download" />],
            ["Ainult tudengid", "privaatne ligipääsumudel", <IconGraduationCap key="cap" />],
            ["Kontrollitud", "nimi.perekonnanimi@eek.ee", <IconCheck key="check" />],
          ].map(([title, text, icon]) => (
            <div
              key={String(title)}
              className="min-h-40 rounded-3xl border border-white/12 bg-white/[0.06] p-7"
            >
              <div className="grid gap-5">
                <div className="flex items-center gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#4A3F37] text-[#FFB31A]">
                    {icon}
                  </span>
                  <h2 className="min-w-0 text-2xl font-black leading-tight text-white">{title}</h2>
                </div>
                <p className="text-base leading-7 text-white/62">{text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <p className="mt-8 max-w-3xl text-xl leading-9 text-white/68">
              Laadi üles konspekte, esitlusi ja kasulikke faile, otsi materjale
              mugavalt ning hoia platvorm ainult Mainori tudengitele mõeldud
              ligipääsuga.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/materials"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FFB31A] px-7 py-4 font-bold text-[#070D1C] shadow-[0_16px_45px_rgba(255,179,26,0.28)] transition hover:bg-[#FFC34D]"
              >
                <IconList />
                Sirvi materjale
              </Link>
              <Link
                href="/add"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-7 py-4 font-bold text-white transition hover:bg-white/14"
              >
                Lisa materjal
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#0B1022]/80 p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold uppercase tracking-[0.32em] text-[#FFB31A]">
                Eelvaade
              </p>
              <span className="rounded-full bg-emerald-400/15 px-4 py-1 text-sm font-bold text-emerald-300">
                Demo
              </span>
            </div>
            <h2 className="mt-3 text-3xl font-black text-white">Kuidas platvorm töötab</h2>
            <div className="mt-6 grid gap-4 text-lg text-white/62">
              {[
                "1. Tudeng logib sisse ülikooli e-postiga.",
                "2. Laeb üles konspekti, esitluse või muu õppematerjali.",
                "3. Teised tudengid otsivad, filtreerivad ja laadivad alla.",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
