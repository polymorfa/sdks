"use client";

import { createContext, useContext } from "react";

import type { DeskCalls } from "./calls.js";

export const CallsContext = createContext<DeskCalls | null>(null);

/** The app-wide calls controller, or null until it is ready. */
export function useCalls(): DeskCalls | null {
  return useContext(CallsContext);
}

/** Contact names seen by the ticket list, used to label calls. */
export const contactNames = new Map<string, string>();
