import { ElementsDemo } from "./elements.js";

export default function ElementsPage() {
  return (
    <main className="page elements-page">
      <header className="page-header">
        <div>
          <a className="back-link" href="/settings">
            ← Back to settings
          </a>
          <h1>Web Components</h1>
          <p>
            The same controllers rendered by framework-neutral custom elements:
            a read-only message list and the template builder.
          </p>
        </div>
      </header>
      <ElementsDemo />
    </main>
  );
}
