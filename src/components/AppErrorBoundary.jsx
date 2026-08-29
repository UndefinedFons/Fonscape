import { Component } from "react";

export function AppErrorFallback() {
  return <main className="app-error-boundary" role="alert">
    <section className="app-error-boundary-panel material-panel">
      <span className="eyebrow">FONSCAPE RECOVERY</span>
      <h1>页面暂时无法显示</h1>
      <p>资源加载可能被中断，或页面遇到了未预期的错误。重新加载通常可以恢复。</p>
      <button type="button" onClick={() => window.location.reload()}>重新加载</button>
    </section>
  </main>;
}

export class AppErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Fonscape application render failed.", error, errorInfo.componentStack);
  }

  render() {
    return this.state.failed ? <AppErrorFallback /> : this.props.children;
  }
}
