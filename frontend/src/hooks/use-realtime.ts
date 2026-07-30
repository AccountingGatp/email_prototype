"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { API_URL } from "@/lib/api";

export function useRealtime(onSync: () => void) {
  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    const handler = () => onSync();
    socket.on("inbox:sync", handler);
    socket.on("thread:updated", handler);
    socket.on("notification", handler);
    return () => {
      socket.off("inbox:sync", handler);
      socket.off("thread:updated", handler);
      socket.off("notification", handler);
      socket.disconnect();
    };
  }, [onSync]);
}
