import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RefFlow · Tus designaciones bajo control",
  description: "Gestiona partidos, tarifas, compañeros, calendario e ingresos de arbitraje.",
  applicationName: "RefFlow",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "RefFlow", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
