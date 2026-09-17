import { loginUrl } from "../auth/AuthContext";

export function LoginPage() {
  return (
    <div className="login-page">
      <h1>CSシフトアプリ</h1>
      <p>schoolwith.me の Google アカウントでログインしてください。</p>
      <a className="button" href={loginUrl}>
        Googleでログイン
      </a>
    </div>
  );
}
