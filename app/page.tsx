import { SessionGate } from "@/components/session";

export default function Home() {
  return <SessionGate access="redirect" />;
}
