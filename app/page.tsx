"use client";

import { SocketProvider } from "@/contexts/SocketProvider";
import { ChatRoom } from "@/components/ChatRoom";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function Home() {
  return (
    <SocketProvider>
      <ErrorBoundary>
        <main className="min-h-screen">
          <ChatRoom />
        </main>
      </ErrorBoundary>
    </SocketProvider>
  );
}
