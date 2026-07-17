import type { Metadata } from "next";
import { GeistMono, GeistSans } from "geist/font";
import "./globals.css";
import "./dashboard.css";
import "./ai.css";
import "./production.css";
import "./weekly.css";
import "./brain.css";
import "./avatar.css";
import "./character.css";
import "./library.css";
import "./refinement.css";

export const metadata: Metadata = {
  title: "Atlas AI OS",
  description: "Private content operating system",
  robots:{index:false,follow:false,noarchive:true,nocache:true},
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
