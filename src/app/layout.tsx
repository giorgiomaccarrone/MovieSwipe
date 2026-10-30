import type { Metadata, Viewport } from "next";
// Font serviti dall'app stessa (niente chiamate a Google in fase di build)
import "@fontsource/bricolage-grotesque/latin-600.css";
import "@fontsource/bricolage-grotesque/latin-800.css";
import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-500.css";
import "@fontsource/figtree/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Popcorn Match",
  description: "Fate swipe su film e serie: quello che piace a tutti finisce nella lista da guardare.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Popcorn Match", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#13111c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
