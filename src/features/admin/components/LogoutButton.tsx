"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { logout } from "../services/logout";

export function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    await logout();
    router.push("/admin/login");
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isLoggingOut}
      onClick={handleLogout}
    >
      {isLoggingOut ? "Signing out..." : "Log out"}
    </Button>
  );
}
