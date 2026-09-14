import { NavLink, Outlet } from "react-router-dom";

export function App() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">VT</div>
          <div>
            <div className="brand-name">VibeTrace</div>
            <div className="brand-sub">reliability · v1.0</div>
          </div>
        </div>
        <nav className="nav">
          <NavItem to="/" label="Dashboard" end />
          <NavItem to="/demo" label="Demo Lab" />
          <NavItem to="/new" label="New Evaluation" />
          <NavItem to="/history" label="Run History" />
          <NavItem to="/compare" label="Compare Runs" />
        </nav>
        <div className="sidebar-foot">
          Reliability testing for
          <br />
          AI-built apps
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({
  to,
  label,
  end,
}: {
  to: string;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
      <span className="nav-dot" />
      {label}
    </NavLink>
  );
}
