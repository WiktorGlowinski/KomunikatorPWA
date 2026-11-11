import type { Metadata, Viewport } from "next";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import "./globals.css";

const bebas = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin", "latin-ext"],
  weight: "400",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "CHATTER – rozmowy głosowe i wideo w przeglądarce",
  description:
    "Twórz pokoje, wysyłaj link i rozmawiaj głosem, obrazem i na czacie. Bez instalowania aplikacji.",
};

export const viewport: Viewport = {
  themeColor: "#14110e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pl"
      className={`${bebas.variable} ${dmSans.variable} antialiased`}
    >
      <body className="font-body flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
