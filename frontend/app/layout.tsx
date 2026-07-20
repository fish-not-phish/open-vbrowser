import type { Metadata } from "next";
import { Share_Tech_Mono } from "next/font/google";
import "./globals.css";
import { AuthContextProvider } from "@/store/AuthContext";
import { WorkspaceProvider } from "@/store/WorkspaceContext";
import { Toaster } from "@/components/ui/sonner"

const shareTechMono = Share_Tech_Mono({
  variable: "--font-share-tech-mono",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Open vBrowser",
  description: "Isolated cloud browser sessions for OSINT investigations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${shareTechMono.variable} antialiased`}
      >
        <Toaster />
        <AuthContextProvider>
          <WorkspaceProvider>
            {children}
          </WorkspaceProvider>
        </AuthContextProvider>
      </body>
    </html>
  );
}
