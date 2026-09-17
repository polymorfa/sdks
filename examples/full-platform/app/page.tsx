export default function Home() {
  return (
    <>
      <h1>Acme Support</h1>
      <p>A support desk built on every Polymorfa SDK surface.</p>
      {process.env.NODE_ENV !== "production" && (
        <form method="post" action="/api/demo-login">
          <label>
            Name <input name="user" defaultValue="casey" required />
          </label>
          <label>
            Role{" "}
            <select name="role" defaultValue="admin">
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button type="submit">Sign in (demo)</button>
        </form>
      )}
    </>
  );
}
