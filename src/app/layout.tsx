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
  // "default" e non "black-translucent": se la pagina passa sotto la barra di stato, iOS 26 la sfoca in automatico.
  // Il colore della barra di stato lo dà il theme-color, che l'app aggiorna con i colori dello sfondo.
  appleWebApp: { capable: true, title: "Filmetto", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#15132a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
