import { redirect } from "next/navigation";

/** `/admin` has no content of its own — it lands the operator on the dashboard (or, via `middleware.ts`, on `/admin/login` if unauthenticated). */
export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
