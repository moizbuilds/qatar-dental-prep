import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Display: Fraunces — an optical serif with authority and warmth, used with
// restraint for headings and big numbers.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

// Body: IBM Plex Sans — a humanist, clinical sans with a "documentation" feel.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Utility: IBM Plex Mono — the signature readout face for all quantitative UI
// (timer, scores, question counts, page citations, category percentages).
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Qatar Dental Prep",
  description: "Study companion for the Qatar National General Dental Qualifying Examination.",
};

// theme-color matches the paper background so the mobile browser chrome blends
// in; viewportFit=cover lets full-bleed layouts reach into notch safe areas.
export const viewport: Viewport = {
  themeColor: "#f3f5f2",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
