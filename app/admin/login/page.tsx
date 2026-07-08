// TODO: implement real login + token issuance.
export default function AdminLogin() {
  return (
    <form style={{ fontFamily: 'system-ui', maxWidth: 320 }}>
      <h1>Sign in</h1>
      <label>
        Email
        <input type="email" name="email" style={{ display: 'block', width: '100%' }} />
      </label>
      <label>
        Password
        <input type="password" name="password" style={{ display: 'block', width: '100%' }} />
      </label>
      <button type="submit" style={{ marginTop: 12 }}>
        Sign in
      </button>
    </form>
  );
}
