import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { At } from "@phosphor-icons/react/At";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Eye } from "@phosphor-icons/react/Eye";
import { EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { Key } from "@phosphor-icons/react/Key";
import { LockKey } from "@phosphor-icons/react/LockKey";
import { UserCircle } from "@phosphor-icons/react/UserCircle";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { useEffect, useState } from "react";
import { api, ApiClientError } from "../community/api.js";
import { useCommunity } from "../community/CommunityProvider.jsx";

function readableSetupError(error, fallback) {
  return error instanceof ApiClientError ? error.message : fallback;
}

function returnHome() {
  window.location.replace("#/");
}

export function AdminSetupPage() {
  const { refresh } = useCommunity();
  const [state, setState] = useState({ loading: true, initialized: false, completed: false, error: "" });
  const [form, setForm] = useState({ token: "", username: "", nickname: "", password: "" });
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api("/admin/setup")
      .then((result) => {
        if (!result || typeof result.initialized !== "boolean") throw new Error("invalid setup response");
        if (!active) return;
        if (result.initialized) returnHome();
        else setState({ loading: false, initialized: false, completed: false, error: "" });
      })
      .catch((error) => active && setState({ loading: false, initialized: false, completed: false, error: readableSetupError(error, "暂时无法检查初始化状态，请确认后端服务已启动后重试。") }));
    return () => { active = false; };
  }, []);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setState((current) => ({ ...current, error: "" }));
    try {
      await api("/admin/setup", { method: "POST", body: form });
      setForm({ token: "", username: "", nickname: "", password: "" });
      setState({ loading: false, initialized: true, completed: true, error: "" });
      await refresh();
      returnHome();
    } catch (error) {
      setState((current) => ({ ...current, error: readableSetupError(error, "暂时无法创建管理员，请检查网络后重试。") }));
    } finally {
      setBusy(false);
    }
  };

  let content;
  if (state.loading) {
    content = <div className="admin-setup-status" role="status" aria-live="polite"><span className="admin-setup-pulse" aria-hidden="true" /><p>正在检查初始化状态…</p></div>;
  } else if (state.initialized) {
    content = <div className="admin-setup-status"><CheckCircle size={42} weight="duotone" aria-hidden="true" /><h1>{state.completed ? "管理员创建成功" : "管理员已完成初始化"}</h1><p>{state.completed ? "一次性初始化令牌现已失效，你可以使用刚创建的账户管理评论。" : "这个页面无需再次操作。一次性初始化令牌已经失效。"}</p><a className="community-primary-button" href="#/">返回首页<ArrowRight size={17} /></a></div>;
  } else {
    content = <>
      <header className="admin-setup-heading">
        <small>ONE-TIME SETUP</small>
        <h1>创建管理员</h1>
        <p>仅首次部署需要完成一次。请输入部署时由你设置的管理员令牌，再创建登录账户。</p>
      </header>
      <form className="community-form admin-setup-form" onSubmit={submit}>
        <label htmlFor="admin-setup-token">
          <span>管理员令牌</span>
          <span className="community-input">
            <Key size={18} aria-hidden="true" />
            <input id="admin-setup-token" name="token" type="text" value={form.token} onChange={update("token")} autoComplete="off" spellCheck="false" required placeholder="输入部署时设置的令牌" />
          </span>
        </label>
        <label htmlFor="admin-setup-nickname">
          <span>昵称</span>
          <span className="community-input">
            <UserCircle size={18} aria-hidden="true" />
            <input id="admin-setup-nickname" name="nickname" value={form.nickname} onChange={update("nickname")} autoComplete="nickname" minLength="1" maxLength="10" required placeholder="希望大家怎样称呼你" />
          </span>
        </label>
        <label htmlFor="admin-setup-username">
          <span>账户名</span>
          <span className="community-input">
            <At size={18} aria-hidden="true" />
            <input id="admin-setup-username" name="username" value={form.username} onChange={update("username")} autoComplete="username" minLength="3" maxLength="20" pattern="[A-Za-z0-9]{3,20}" required placeholder="3–20 位英文字母或数字" />
          </span>
        </label>
        <label htmlFor="admin-setup-password">
          <span>密码</span>
          <span className="community-input community-input--password">
            <LockKey size={18} aria-hidden="true" />
            <input id="admin-setup-password" name="password" type={passwordVisible ? "text" : "password"} value={form.password} onChange={update("password")} autoComplete="new-password" minLength="6" maxLength="20" pattern="[A-Za-z0-9]{6,20}" required placeholder="6–20 位英文字母或数字" />
            <button type="button" className="password-visibility-button" aria-label={passwordVisible ? "隐藏密码" : "显示密码"} aria-pressed={passwordVisible} onClick={() => setPasswordVisible((visible) => !visible)}>
              {passwordVisible ? <EyeSlash size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
            </button>
          </span>
        </label>
        {state.error && <p className="community-form-error" role="alert"><WarningCircle size={17} aria-hidden="true" />{state.error}</p>}
        <button className="community-primary-button" type="submit" disabled={busy}>{busy ? "正在创建…" : "创建管理员"}<ArrowRight size={17} /></button>
      </form>
    </>;
  }

  return <main className="admin-setup-page"><section className="admin-setup-panel material-panel" aria-busy={state.loading || busy}>{content}</section></main>;
}
