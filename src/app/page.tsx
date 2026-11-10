import { getConfig } from '@/server/config';
import { SiteName } from "@/components/SiteName";
// inside the component:
console.log('DEMO_SECRET configured, length:', getConfig().DEMO_SECRET.length);

export default function Home() {
  return (
    <SiteName />
  );
}
