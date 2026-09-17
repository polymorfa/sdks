"use client";

import { Logo } from "../shell.js";

/**
 * DEMO ONLY sign-in. It posts to /api/demo-login, which sets unsigned cookies
 * that anyone can forge. Replace it with your real authentication.
 */
export function LoginPage({ error }: { readonly error?: string }) {
  return (
    <main className="login">
      <div className="login-card">
        <Logo />
        <h1>Sign in to the help desk</h1>
        <p className="muted">
          Pick a name and role for this demo. This sign-in sets unsigned cookies
          and exists for demos only; replace it with your own authentication
          before using real credentials.
        </p>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <form method="post" action="/api/demo-login" className="form-stack">
          <div className="field">
            <label htmlFor="login-user">Agent name</label>
            <input
              id="login-user"
              className="input"
              name="user"
              defaultValue="casey"
              pattern="[\w.\-]{1,64}"
              autoComplete="username"
              required
            />
          </div>
          <fieldset className="plain-fieldset">
            <legend className="label">Role</legend>
            <div className="radio-cards">
              <label className="radio-card">
                <input type="radio" name="role" value="admin" defaultChecked />
                <span>
                  <strong>Admin</strong>
                  <small>Everything, including sessions and billing</small>
                </span>
              </label>
              <label className="radio-card">
                <input type="radio" name="role" value="agent" />
                <span>
                  <strong>Agent</strong>
                  <small>Tickets, contacts and calls</small>
                </span>
              </label>
            </div>
          </fieldset>
          <button type="submit" className="btn btn-primary btn-md btn-block">
            Sign in (demo)
          </button>
        </form>
        <p className="login-foot muted small">
          Without Polymorfa credentials the app runs on built-in sample data.
        </p>
      </div>
    </main>
  );
}
