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

const components = { img: MdxImage };

/** Renders an MDX body string (from the content functions) in a server component. */
export function Mdx({ source }: { source: string }) {
  return (
    <div className="space-y-4 leading-relaxed">
      <MDXRemote source={source} components={components} />
    </div>
  );
}
