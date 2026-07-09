"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button variant="outline" type="submit">
        <LogOut className="h-4 w-4" />
        サインアウト
      </Button>
    </form>
  );
}
