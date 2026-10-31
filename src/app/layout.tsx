import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { I18nProvider } from "@/lib/i18n/context";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Clara — honest AI image advisor",
  description:
    "Show Clara a garment you love from any store: she tries it on you with YouCam AI, judges its cut and color against your proportions and undertone, explains why, and shows you how to make it work.",
};

export const viewport: Viewport = {
  themeColor: "#faf6f1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
