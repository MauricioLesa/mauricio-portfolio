import type { Metadata } from 'next';
import Link from 'next/link';
import { Chat } from '@/components/chat/Chat';

export const metadata: Metadata = { title: 'AI assistant' };

// T080: the assistant page.
export default function AssistantPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">AI assistant</h1>
      <p>
        Ask about my projects, skills and experience. The assistant is Claude Haiku with three read-only tools over this
        site&apos;s content, so it only answers from what&apos;s published here. Open &quot;How I answered&quot; under any
        answer to see the tool calls, tokens, cost and latency.
      </p>
      <noscript>
        <p>
          The assistant needs JavaScript. The <Link href="/cv">CV</Link> and <Link href="/projects">Projects</Link> pages
          have the same information.
        </p>
      </noscript>
      <Chat />
    </div>
  );
}
