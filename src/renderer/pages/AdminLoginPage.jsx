import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import styles from "./LoginPage.module.css";
import lcmsLogo from "../../image/LCMS.png";

const SUPERADMIN_ACCESS_CODE = "451984";

export default function AdminLoginPage({ onBack, onAdminLoggedIn, onSuperadminAccess, superadmin = false }) {
  const { login, loading, error, clearError } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [localError, setLocalError] = useState("");
  const [codeGate, setCodeGate] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeAttempts, setCodeAttempts] = useState(0);
  const logoClicks = useRef({ count: 0, time: 0 });
  const codeInputRef = useRef(null);
  const usernameInputRef = useRef(null);

  // `autoFocus` alone is unreliable here — the logo click that reveals the
  // code box, and the entrance swap into the superadmin form, can both leave
  // focus sitting on the just-clicked element instead. Force it explicitly.
  useEffect(() => {
    if (codeGate) codeInputRef.current?.focus();
  }, [codeGate]);
  useEffect(() => {
    if (!codeGate) usernameInputRef.current?.focus();
  }, [codeGate, superadmin]);

  function logoClick() {
    if (superadmin || loading) return;
    const now = Date.now();
    logoClicks.current.count = now - logoClicks.current.time > 2000 ? 1 : logoClicks.current.count + 1;
    logoClicks.current.time = now;
    if (logoClicks.current.count === 5) { logoClicks.current.count = 0; setCodeGate(true); setCodeError(""); setCodeInput(""); setCodeAttempts(0); }
  }

  function submitCode(e) {
    e.preventDefault();
    if (codeInput.trim() === SUPERADMIN_ACCESS_CODE) {
      setCodeGate(false); setCodeAttempts(0); clearError(); onSuperadminAccess?.();
      return;
    }
    const attempts = codeAttempts + 1;
    // Three wrong tries kicks all the way out to the starting login page,
    // rather than just retrying the code box, so guessing can't be brute-forced
    // by sitting on this screen.
    if (attempts >= 3) {
      setCodeGate(false); setCodeInput(""); setCodeError(""); setCodeAttempts(0);
      onBack?.();
      return;
    }
    setCodeAttempts(attempts);
    setCodeError(`Incorrect code. ${3 - attempts} attempt${3 - attempts === 1 ? "" : "s"} left.`);
    setCodeInput("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalError("");
    clearError();
    const result = await login(username.trim(), password, { entrance: superadmin ? 'superadmin' : 'admin' });
    if (!result.success) return;
    if (!superadmin) onAdminLoggedIn?.();
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.rings}>
        <div className={styles.ring1} />
        <div className={styles.ring2} />
        <div className={styles.ring3} />
      </div>

      <div className={styles.card}>
        <div className={styles.logoWrap} onClick={logoClick}>
          <img className={styles.logo} src={lcmsLogo} alt="LCMS — Leave Credits Management System" />
        </div>

        <div className={styles.header}>
          <p className={styles.sub2}>{codeGate ? 'Enter Access Code' : superadmin ? 'Superadmin Access' : 'Administrator Access'}</p>
        </div>

        {codeGate ? (
          <form onSubmit={submitCode} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="superadmin-code">6-digit code</label>
              <input
                ref={codeInputRef}
                id="superadmin-code"
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoComplete="off"
                value={codeInput}
                onChange={(e) => { setCodeInput(e.target.value); setCodeError(""); }}
                placeholder="Enter the access code"
                required
              />
            </div>
            {codeError && (
              <div className={styles.errorBox} role="alert">
                {codeError}
              </div>
            )}
            <button type="submit" className={styles.submitBtn}>Continue</button>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="admin-username">Username</label>
            <input
              ref={usernameInputRef}
              id="admin-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="admin-password">Password</label>
            <div className={styles.passWrap}>
              <input
                id="admin-password"
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPass((v) => !v)}
                tabIndex={-1}
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {(localError || error || codeError) && (
            <div className={styles.errorBox} role="alert">
              {localError || error || codeError}
            </div>
          )}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
        )}

        <p className={styles.registrationHint}>
          <button type="button" onClick={onBack} style={{ background: "none", border: 0, color: "var(--sdo-blue)", cursor: "pointer", font: "inherit" }}>
            ← Back
          </button>
        </p>
      </div>
    </div>
  );
}
