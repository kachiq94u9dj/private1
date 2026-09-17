import { NavLink } from "react-router-dom";
import { logout } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function Nav() {
  const { user, refresh } = useAuth();
  if (!user) return null;

  const onLogout = async () => {
    await logout();
    await refresh();
  };

  return (
    <nav className="nav">
      <div className="nav-links">
        <NavLink to="/availability">出勤可否入力</NavLink>
        <NavLink to="/calendar">シフトカレンダー</NavLink>
        <NavLink to="/requests">変更・交換申請</NavLink>
        {user.isAdmin && <NavLink to="/holidays">祝日管理</NavLink>}
      </div>
      <div className="nav-user">
        <span>{user.name}</span>
        <button onClick={onLogout}>ログアウト</button>
      </div>
    </nav>
  );
}
