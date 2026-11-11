import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { getCv, getPublicEmail } from "@/server/content";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const cv = await getCv();
  return {
    title: { default: `${cv.name} · ${cv.headline}`, template: `%s · ${cv.name}` },
    description: cv.headline,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [cv, email] = await Promise.all([getCv(), getPublicEmail()]);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only rounded bg-accent px-3 py-2 text-accent-contrast focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-20"
        >
          Skip to content
        </a>

        <header className="border-b border-border">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="font-semibold text-foreground no-underline">
              {cv.name}
            </Link>
            <Nav />
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 focus:outline-none">
          {children}
        </main>

        <footer className="border-t border-border">
          <div className="mx-auto max-w-5xl px-4 py-4 text-sm text-muted">
            Contact: <a href={`mailto:${email}`}>{email}</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
