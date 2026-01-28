"use client";

import { SocketProvider } from "@/contexts/SocketProvider";
import { ChatRoom } from "@/components/ChatRoom";

export default function Home() {
  return (
    <SocketProvider>
      <main className="min-h-screen">
        <ChatRoom />
      </main>
    </SocketProvider>
  );
}
