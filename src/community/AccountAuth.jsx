import { useEffect, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { At } from "@phosphor-icons/react/At";
import { Eye } from "@phosphor-icons/react/Eye";
import { EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { LockKey } from "@phosphor-icons/react/LockKey";
import { UserCircle } from "@phosphor-icons/react/UserCircle";
import { useCommunity } from "./CommunityProvider.jsx";

export function AccountAuth() {
  const { authMode, setAuthMode, login, register } = useCommunity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState({ password: false, confirmation: false });
  useEffect(() => setVisiblePasswords({ password: false, confirmation: false }), [authMode]);
  const passwordField = (name, label, autoComplete) => {
    const visible = visiblePasswords[name];
    return <label><span>{label}</span><span className="community-input community-input--password"><LockKey size={18} /><input name={name === "confirmation" ? "passwordConfirmation" : "password"} type={visible ? "text" : "password"} autoComplete={autoComplete} minLength="6" maxLength={authMode === "register" ? "20" : "128"} required placeholder={authMode === "register" ? (name === "confirmation" ? "再次输入密码" : "设置密码") : "输入你的密码"} /><button type="button" className="password-visibility-button" aria-label={visible ? `隐藏${label}` : `显示${label}`} aria-pressed={visible} onClick={() => setVisiblePasswords((current) => ({ ...current, [name]: !current[name] }))}>{visible ? <EyeSlash size={19} /> : <Eye size={19} />}</button></span></label>;
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (authMode === "register" && data.password !== data.passwordConfirmation) {
      setError("两次输入的密码不一致，请重新确认。");
      setBusy(false);
      return;
    }
    if (authMode === "register") {
      const username = String(data.username || "").trim();
      const password = String(data.password || "");
      const nickname = String(data.nickname || "").trim().replace(/\s+/gu, " ");
      if (!/^[A-Za-z0-9]{3,20}$/u.test(username)) {
        setError("账户名需为 3–20 位英文字母或数字。");
        setBusy(false);
        return;
      }
      if (!/^[A-Za-z0-9]{6,20}$/u.test(password)) {
        setError("密码需为 6–20 位英文字母或数字。");
        setBusy(false);
        return;
      }
      if (nickname.length < 1 || nickname.length > 10 || !/^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u.test(nickname)) {
        setError("昵称需为 1–10 个字符，可由任意语言的文字、字母或数字组成。");
        setBusy(false);
        return;
      }
    }
    delete data.passwordConfirmation;
    try {
      if (authMode === "register") await register(data);
      else await login(data);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };
  return <div className="account-auth">
    <header className="account-auth-head"><div className="account-dialog-heading"><span className="account-dialog-icon"><UserCircle size={24} weight="duotone" /></span><div><small>FONSCAPE ACCOUNT</small><h2>{authMode === "register" ? "创建账户" : "欢迎回来"}</h2></div></div><div className="account-mode-tabs" data-active={authMode === "register" ? "right" : "left"} role="tablist" aria-label="账户操作"><button type="button" className={authMode === "login" ? "active" : ""} aria-selected={authMode === "login"} role="tab" onClick={() => { setAuthMode("login"); setError(""); }}>登录</button><button type="button" className={authMode === "register" ? "active" : ""} aria-selected={authMode === "register"} role="tab" onClick={() => { setAuthMode("register"); setError(""); }}>注册</button></div></header>
    <form className="community-form account-auth-form" onSubmit={submit}>
      {authMode === "register" && <label><span>昵称</span><span className="community-input"><UserCircle size={18} /><input name="nickname" autoComplete="nickname" minLength="1" maxLength="10" required placeholder="希望大家怎样称呼你" /></span></label>}
      <label><span>账户名</span><span className="community-input"><At size={18} /><input name="username" autoComplete="username" minLength="3" maxLength={authMode === "register" ? "20" : undefined} required placeholder={authMode === "register" ? "设置一个唯一账户名" : "输入你的账户名"} /></span></label>
      {passwordField("password", "密码", authMode === "register" ? "new-password" : "current-password")}
      {authMode === "register" && passwordField("confirmation", "确认密码", "new-password")}
      {error && <p className="community-form-error" role="alert">{error}</p>}
      <button className="community-primary-button" type="submit" disabled={busy}>{busy ? "请稍候…" : authMode === "register" ? "创建并登录" : "登录"}<ArrowRight size={17} /></button>
    </form>
  </div>;
}
