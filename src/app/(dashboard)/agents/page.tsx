import { redirect } from "next/navigation";

// Agents are managed per server, so the old standalone page now lives on Servers.
export default function AgentsPage() {
    redirect("/servers");
}
