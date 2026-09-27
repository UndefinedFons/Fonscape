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

function RouteErrorFallback({ onRetry }) {
  return <section className="route-load-error material-panel" role="alert">
    <h2>内容暂时无法加载</h2>
    <p>网络请求可能暂时中断，请重试。</p>
    <button type="button" onClick={onRetry}>重试</button>
  </section>;
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

export class RouteErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Fonscape route content failed to render.", error, errorInfo.componentStack);
  }

  retry = () => this.setState({ failed: false });

  render() {
    return this.state.failed
      ? <RouteErrorFallback onRetry={this.retry} />
      : this.props.children;
  }
}
