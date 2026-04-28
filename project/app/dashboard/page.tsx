"use client";

import { useEffect } from "react";

export default function DashboardPage() {
  useEffect(() => {
    window.location.replace("/materials");
  }, []);

  return null;
}
