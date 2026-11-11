import type { ComponentPropsWithoutRef } from 'react';
import { MDXRemote } from 'next-mdx-remote/rsc';

/** Images in MDX must declare alt text; an empty string marks a decorative image (FR-028). */
function MdxImage({ alt, ...props }: ComponentPropsWithoutRef<'img'>) {
  if (alt === undefined) {
    throw new Error(`MDX image ${props.src ? `"${String(props.src)}" ` : ''}is missing alt text`);
  }
  // MDX images have no known dimensions, so next/image (which needs them) doesn't fit here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} {...props} />;
}

// Tailwind resets heading and list styles, so MDX elements get their typography here.
const components = {
  img: MdxImage,
  h2: (props: ComponentPropsWithoutRef<'h2'>) => <h2 className="mt-4 text-xl font-semibold" {...props} />,
  h3: (props: ComponentPropsWithoutRef<'h3'>) => <h3 className="mt-2 text-lg font-semibold" {...props} />,
  ul: (props: ComponentPropsWithoutRef<'ul'>) => <ul className="list-disc space-y-1 pl-6" {...props} />,
  ol: (props: ComponentPropsWithoutRef<'ol'>) => <ol className="list-decimal space-y-1 pl-6" {...props} />,
};

/** Renders an MDX body string (from the content functions) in a server component. */
export function Mdx({ source }: { source: string }) {
  return (
    <div className="space-y-4 leading-relaxed">
      <MDXRemote source={source} components={components} />
    </div>
  );
}
