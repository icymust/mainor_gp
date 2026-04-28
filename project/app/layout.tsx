import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar";

export const metadata: Metadata = {
  title: "UniSwap Materials",
  description: "Mainor university study material sharing platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="et">
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
