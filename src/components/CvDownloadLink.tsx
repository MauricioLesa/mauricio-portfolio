/**
 * "Download CV". It points at /api/cv/link, which issues a short-lived download link (US2). It is
 * a plain <a> rather than next/link because the target is an API redirect, not a page.
 */
export function CvDownloadLink({ className, label = 'Download CV' }: { className?: string; label?: string }) {
  return (
    <a href="/api/cv/link" rel="nofollow" className={className} data-analytics-event="cv-download">
      {label}
    </a>
  );
}
