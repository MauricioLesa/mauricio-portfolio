'use client';

export function SiteName() {
  return <p>{process.env.NEXT_PUBLIC_SITE_NAME}</p>;
}