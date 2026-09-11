import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import styles from "./LoginPage.module.css";
import lcmsLogo from "../../image/LCMS.png";

const ROLE_LABELS = {
  hrmo: "HRMO / Administrator",
  aoii: "Administrative Officer II (School-Based)",
};

export default function LoginPage({ onSecretAccess } = {}) {
  const { login, register, checkRegistration, requestPasswordReset, confirmPasswordReset, loading, error, clearError } = useAuth();
  const logoClickCount = useRef(0);
  const lastLogoClick = useRef(0);

  function handleLogoClick() {
    const now = Date.now();
    if (now - lastLogoClick.current > 2000) logoClickCount.current = 0;
    lastLogoClick.current = now;
    logoClickCount.current += 1;
    if (logoClickCount.current >= 5) {
      logoClickCount.current = 0;
      onSecretAccess?.();
    }
  }
  const [mode, setMode] = useState("login"); // 'login' | 'register' | 'forgot'
  const [username, setUsername] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const [regCheck, setRegCheck] = useState(null); // { email_matched, name_matched, already_registered, role, school_name } | null

  // Forgot-password: a desktop app has no web page to land a reset link on,
  // so this is a two-step in-app flow — request a 6-digit code by email,
  // then enter that code plus a new password right here.
  const [forgotStep, setForgotStep] = useState("request"); // 'request' | 'confirm'
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  // As soon as email + family/first name are entered during registration,
  // check eligibility live — so the user finds out before submitting
  // whether their email or name doesn't match the approved record, instead
  // of only after signing in.
  useEffect(() => {
    if (mode !== "register" || !email.trim().includes("@") || !lastName.trim() || !firstName.trim()) {
      setRegCheck(null);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      const result = await checkRegistration({ email, lastName, firstName, middleName });
      if (active) setRegCheck(result);
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [mode, email, lastName, firstName, middleName, checkRegistration]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalError("");
    setNotice("");

    if (mode === "register") {
      if (password.length < 8) {
        setLocalError("Password must contain at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setLocalError("Passwords do not match.");
        return;
      }

      const result = await register({ username, email, password, lastName, firstName, middleName });
      if (result.success) {
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setNotice(result.requiresEmailConfirmation
          ? "Registration successful. Confirm your email, then sign in."
          : "Registration successful. You can now sign in.");
      }
      return;
    }

    await login(username.trim(), password);
  }

  async function handleForgotSubmit(e) {
    e.preventDefault();
    setLocalError("");
    setNotice("");

    if (forgotStep === "request") {
      const result = await requestPasswordReset(forgotIdentifier);
      if (result.success) {
        setResetEmail(result.email);
        setForgotStep("confirm");
      }
      return;
    }

    if (newPassword.length < 8) {
      setLocalError("Password must contain at least 8 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setLocalError("Passwords do not match.");
      return;
    }
    const result = await confirmPasswordReset({ email: resetEmail, code: resetCode, newPassword });
    if (result.success) {
      switchMode("login");
      setNotice("Password reset. You can now sign in with your new password.");
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setLocalError("");
    setNotice("");
    clearError();
    if (nextMode === "forgot") {
      setForgotStep("request");
      setForgotIdentifier(username);
      setResetEmail("");
      setResetCode("");
      setNewPassword("");
      setConfirmNewPassword("");
    }
  }

  const regNotice = !regCheck ? null
    : !regCheck.email_matched
      ? { tone: "error", text: "This email is not on the approved list. Contact the dashboard manager." }
      : regCheck.already_registered
        ? { tone: "error", text: "This email has already been registered. Please sign in instead." }
        : !regCheck.name_matched
          ? { tone: "error", text: "Your name doesn't match our records for this email — check the spelling of your family, first, and middle name." }
          : { tone: "ok", text: `You will register as ${ROLE_LABELS[regCheck.role] || regCheck.role}${regCheck.school_name ? ` — ${regCheck.school_name}` : ""}` };

  return (
    <div className={styles.wrap}>
      {/* Animated background rings */}
      <div className={styles.rings}>
        <div className={styles.ring1} />
        <div className={styles.ring2} />
        <div className={styles.ring3} />
      </div>

      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <img
            className={styles.logo}
            src={lcmsLogo}
            alt="LCMS — Leave Credits Management System"
            onClick={handleLogoClick}
          />
        </div>

        <div className={styles.header}>
          <p className={styles.sub2}>
            Powered by BuzzJay
          </p>
        </div>

        {mode !== "forgot" && (
          <div className={styles.modeTabs}>
            <button type="button" aria-pressed={mode === "login"} className={mode === "login" ? styles.modeActive : ""} onClick={() => switchMode("login")}>Sign In</button>
            <button type="button" aria-pressed={mode === "register"} className={mode === "register" ? styles.modeActive : ""} onClick={() => switchMode("register")}>Register</button>
          </div>
        )}

        {mode === "forgot" ? (
          <form onSubmit={handleForgotSubmit} className={styles.form}>
            {forgotStep === "request" ? (
              <div className={styles.field}>
                <label htmlFor="forgotIdentifier">Username or Email</label>
                <input
                  id="forgotIdentifier"
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  placeholder="Enter your username or email"
                  required
                  autoFocus
                />
              </div>
            ) : (
              <>
                <div className={styles.infoBox} role="status">
                  A 6-digit code was sent to <strong>{resetEmail}</strong>. Enter it below with your new password.
                </div>
                <div className={styles.field}>
                  <label htmlFor="resetCode">Reset Code</label>
                  <input
                    id="resetCode"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="6-digit code"
                    inputMode="numeric"
                    required
                    autoFocus
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="newPassword">New Password</label>
                  <div className={styles.passWrap}>
                    <input
                      id="newPassword"
                      type={showPass ? "text" : "password"}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter your new password"
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
                <div className={styles.field}>
                  <label htmlFor="confirmNewPassword">Confirm New Password</label>
                  <input id="confirmNewPassword" type={showPass ? "text" : "password"} autoComplete="new-password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder="Re-enter your new password" required />
                </div>
              </>
            )}

            {(localError || error) && (
              <div className={styles.errorBox} role="alert">
                {localError || error}
              </div>
            )}

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading
                ? (forgotStep === "request" ? "Sending…" : "Resetting…")
                : (forgotStep === "request" ? "Send Reset Code" : "Reset Password")}
            </button>

            <p className={styles.registrationHint}>
              <button type="button" onClick={() => switchMode("login")} style={{ background: "none", border: 0, color: "var(--sdo-blue)", cursor: "pointer", font: "inherit" }}>
                ← Back to Sign In
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            {mode === "register" && (
              <>
                <div className={styles.field}>
                  <label htmlFor="lastName">Family Name</label>
                  <input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dela Cruz" required />
                </div>
                <div className={styles.field}>
                  <label htmlFor="firstName">First Name</label>
                  <input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Juan" required />
                </div>
                <div className={styles.field}>
                  <label htmlFor="middleName">Middle Name or Initial</label>
                  <input id="middleName" value={middleName} onChange={(e) => setMiddleName(e.target.value)} placeholder="Santos or S" />
                </div>
                <div className={styles.field}>
                  <label htmlFor="email">Approved Email</label>
                  <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your approved email" required />
                </div>
                {regNotice && (
                  <div className={regNotice.tone === "ok" ? styles.infoBox : styles.errorBox} role={regNotice.tone === "ok" ? "status" : "alert"}>
                    {regNotice.text}
                  </div>
                )}
              </>
            )}
            <div className={styles.field}>
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="password">Password</label>
              <div className={styles.passWrap}>
                <input
                  id="password"
                  type={showPass ? "text" : "password"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
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

            {mode === "login" && (
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                style={{ background: "none", border: 0, color: "var(--sdo-blue)", cursor: "pointer", font: "inherit", fontSize: 12, alignSelf: "flex-end", padding: 0 }}
              >
                Forgot password?
              </button>
            )}

            {mode === "register" && (
              <div className={styles.field}>
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input id="confirmPassword" type={showPass ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" required />
              </div>
            )}

            {(localError || error) && (
              <div className={styles.errorBox} role="alert">
                {localError || error}
              </div>
            )}

            {notice && <div className={styles.successBox} role="status">{notice}</div>}

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? (mode === "register" ? "Registering…" : "Signing in…") : (mode === "register" ? "Register" : "Sign In")}
            </button>
          </form>
        )}

        {mode === "register" && (
          <p className={styles.registrationHint}>Registration is limited to users pre-approved by the HRMO.</p>
        )}

        <div className={styles.footer}>
          <strong>L</strong>eading with <strong>C</strong>ompassionate and <strong>M</strong>odernized <strong>S</strong>ervices · v{__APP_VERSION__ || "1.0.0"}
        </div>
      </div>
    </div>
  );
}
