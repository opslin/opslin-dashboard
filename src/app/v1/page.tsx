import { redirect } from "next/navigation";

export default function LegacyV1Page() {
  redirect("/v1/apps");
}
