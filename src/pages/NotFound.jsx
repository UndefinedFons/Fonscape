import { routeHref } from "../routes.js";

export function NotFound({ embedded = false }) { const Container = embedded ? "section" : "main"; return <Container className="empty-state page-width"><h1>这里暂时没有内容</h1><a className="outline-button" href={routeHref("/")}>回到首页</a></Container>; }
