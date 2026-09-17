import { DeskApp } from "../ui/app.js";

// The help desk is a client-rendered app; every path renders the same shell.
export default function Home() {
  return <DeskApp />;
}
