import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/auth-provider";
import { GoogleAuthProvider } from "@/components/google-auth-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "InboxLens — Shared Client Email Tracker",
  description: "Track replies, tags, and accountability for your shared inbox",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full">
        <TooltipProvider>
          <GoogleAuthProvider>
            <AuthProvider>
              {children}
              <Toaster />
            </AuthProvider>
          </GoogleAuthProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
