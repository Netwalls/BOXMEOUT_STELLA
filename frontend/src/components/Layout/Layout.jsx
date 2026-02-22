import React from "react";
import Navbar from "./Navbar";

const Layout = ({ children, user }) => {
  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <Navbar user={user} />
      <main className="container" style={{ flex: 1, paddingBottom: "4rem" }}>
        {children}
      </main>
      <footer
        style={{
          textAlign: "center",
          padding: "2rem",
          borderTop: "1px solid var(--color-border)",
          color: "var(--color-text-muted)",
        }}
      >
        <p>&copy; 2026 BoxMeOut Prediction Market. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Layout;
