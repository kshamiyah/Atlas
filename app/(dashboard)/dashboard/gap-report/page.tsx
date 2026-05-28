import { redirect } from "next/navigation";

export default function GapReportRedirectPage() {
  redirect("/dashboard/progress?view=priorities");
}
