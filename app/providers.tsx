"use client";

import { ReactNode } from "react";
import { Toaster } from "react-hot-toast";

type ProvidersProps = {
  children: ReactNode;
};

export default function Providers({ children }: ProvidersProps) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "#0f172a",
            color: "#e2e8f0",
            border: "1px solid #334155",
          },
          success: {
            iconTheme: {
              primary: "#22c55e",
              secondary: "#0f172a",
            },
          },
          error: {
            iconTheme: {
              primary: "#ef4444",
              secondary: "#0f172a",
            },
          },
        }}
      />
    </>
  );
}
