import type { Metadata, Viewport } from "next";
// Su iPhone/Mac si usa il font di sistema (SF Pro); Figtree è il ripiego per gli altri dispositivi
import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-500.css";
import "@fontsource/figtree/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Filmetto",
  description: "Fate swipe su film e serie: quello che piace a tutti finisce nella lista da guardare.",
  manifest: "/manifest.webmanifest",
  // "black" e non "black-translucent": se la pagina passa sotto la barra di stato, iOS 26 la sfoca in automatico
  appleWebApp: { capable: true, title: "Filmetto", statusBarStyle: "black" },
};

export const viewport: Viewport = { themeColor: "#0a0a0f", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
