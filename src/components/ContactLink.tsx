import { getPublicEmail } from '@/server/content';

/** "Contact me": a mailto link to the public email, the only contact detail on the site (FR-005). */
export async function ContactLink({ className, label = 'Contact me' }: { className?: string; label?: string }) {
  const email = await getPublicEmail();
  return (
    <a href={`mailto:${email}`} className={className} data-analytics-event="contact-click">
      {label}
    </a>
  );
}
