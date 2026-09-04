import { expect, test } from "@playwright/test";

const viewer = {
  id: "member-1",
  username: "reader01",
  nickname: "读者",
  role: "member",
  status: "active",
  unreadReplies: 0,
  unreadAdminComments: 0,
  avatarUrl: null,
  createdAt: 1,
};

function comment(id, body, createdAt) {
  return {
    id,
    parentId: null,
    replyTo: null,
    replyToUser: null,
    body,
    status: "published",
    createdAt,
    updatedAt: createdAt,
    editedAt: null,
    canDelete: true,
    author: viewer,
  };
}

function reply(id, body, createdAt, parentId) {
  return { ...comment(id, body, createdAt), parentId, replyTo: "读者" };
}

test("a lost comment response can be retried once and older comments remain reachable through pagination", async ({ page }) => {
  const recent = comment("recent-comment", "较新的既有评论", 200);
  const older = comment("older-comment", "分页加载出的更早评论", 100);
  const created = comment("created-comment", "网络重试评论", 300);
  const mutationIds = [];
  let writeCompleted = false;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user: viewer } });
    if (path === "/api/site/runtime") return route.fulfill({ json: { launchedAt: 1 } });
    if (path === "/api/content/stats") return route.fulfill({ json: { stats: {} } });
    if (path === "/api/comments" && request.method() === "GET") {
      if (url.searchParams.get("page") === "2") {
        return route.fulfill({ json: { comments: [older], total: 201, page: 2, pageSize: 20, totalPages: 11 } });
      }
      return route.fulfill({
        json: {
          comments: writeCompleted ? [created, recent] : [recent],
          total: writeCompleted ? 201 : 200,
          page: 1,
          pageSize: 20,
          totalPages: 11,
        },
      });
    }
    if (path === "/api/comments" && request.method() === "POST") {
      const payload = request.postDataJSON();
      mutationIds.push(payload.clientMutationId);
      writeCompleted = true;
      if (mutationIds.length === 1) return route.abort("connectionfailed");
      return route.fulfill({ status: 200, json: { comment: created, replayed: true } });
    }
    return route.fulfill({ status: 404, json: { error: "not mocked" } });
  });

  await page.goto("/#/about");
  await expect(page.getByText("200 条评论")).toBeVisible();
  const editor = page.getByPlaceholder("在这里留下你的想法…");
  await editor.fill("网络重试评论");
  await page.getByRole("button", { name: "发表" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "发表" }).click();

  await expect(page.getByText("网络重试评论")).toBeVisible();
  await expect(page.getByText("201 条评论")).toBeVisible();
  expect(mutationIds).toHaveLength(2);
  expect(mutationIds[1]).toBe(mutationIds[0]);

  await page.getByRole("button", { name: "第 2 页" }).click();
  await expect(page.getByText("分页加载出的更早评论")).toBeVisible();
});

test("a reply posted from another page is fetched, expanded, and located", async ({ page }) => {
  const recent = comment("page-one", "较新的评论", 300);
  const older = comment("page-two", "另一页的父评论", 200);
  const existingReply = reply("existing-reply", "已有回复", 210, older.id);
  const createdReply = reply("created-reply", "跨页新回复", 400, older.id);
  let postedParentId = "";
  const locatedQueries = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user: viewer } });
    if (path === "/api/site/runtime") return route.fulfill({ json: { launchedAt: 1 } });
    if (path === "/api/content/stats") return route.fulfill({ json: { stats: {} } });
    if (path === "/api/comments" && request.method() === "GET") {
      const locatedId = url.searchParams.get("comment");
      if (locatedId) {
        locatedQueries.push(locatedId);
        return route.fulfill({ json: { comments: [older, existingReply, createdReply], total: 22, page: 2, pageSize: 20, totalPages: 2 } });
      }
      if (url.searchParams.get("page") === "2") {
        return route.fulfill({ json: { comments: [older, existingReply], total: 21, page: 2, pageSize: 20, totalPages: 2 } });
      }
      return route.fulfill({ json: { comments: [recent], total: 21, page: 1, pageSize: 20, totalPages: 2 } });
    }
    if (path === "/api/comments" && request.method() === "POST") {
      postedParentId = request.postDataJSON().parentId;
      return route.fulfill({ status: 201, json: { comment: createdReply } });
    }
    return route.fulfill({ status: 404, json: { error: "not mocked" } });
  });

  await page.goto("/#/about");
  await expect(page.getByText("21 条评论")).toBeVisible();
  await page.getByRole("button", { name: "第 2 页" }).click();
  const parent = page.locator("#comment-page-two");
  await expect(parent).toBeVisible();
  await parent.getByRole("button", { name: "回复" }).click();
  const replyComposer = page.locator(".comment-composer--reply");
  await replyComposer.getByPlaceholder("写下回复…").fill("跨页新回复");
  await replyComposer.getByRole("button", { name: "发表" }).click();

  await expect(page.getByText("跨页新回复")).toBeVisible();
  await expect.poll(() => postedParentId).toBe(older.id);
  await expect.poll(() => locatedQueries).toContain(createdReply.id);
  await expect(page.getByRole("button", { name: "收起回复" })).toBeVisible();
});

test("a successful comment stays published when its follow-up locate request fails", async ({ page }) => {
  const existing = comment("existing-comment", "已有评论", 200);
  const created = comment("created-but-unlocatable", "已发布但暂时无法定位", 300);
  const followUpQueries = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user: viewer } });
    if (path === "/api/site/runtime") return route.fulfill({ json: { launchedAt: 1 } });
    if (path === "/api/content/stats") return route.fulfill({ json: { stats: {} } });
    if (path === "/api/comments" && request.method() === "GET") {
      if (url.searchParams.get("comment") === created.id) {
        followUpQueries.push(url.searchParams.get("comment"));
        return route.fulfill({ status: 503, json: { error: "评论定位暂时不可用。", code: "temporary_failure" } });
      }
      return route.fulfill({ json: { comments: [existing], total: 1, page: 1, pageSize: 20, totalPages: 1 } });
    }
    if (path === "/api/comments" && request.method() === "POST") {
      return route.fulfill({ status: 201, json: { comment: created } });
    }
    return route.fulfill({ status: 404, json: { error: "not mocked" } });
  });

  await page.goto("/#/about");
  const editor = page.getByPlaceholder("在这里留下你的想法…");
  await expect(editor).toBeVisible();
  await editor.fill(created.body);
  await page.getByRole("button", { name: "发表" }).click();

  await expect.poll(() => followUpQueries).toContain(created.id);
  await expect(editor).toHaveValue("");
  await expect(page.getByText("评论定位暂时不可用。")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "重试" }).click();
  await expect.poll(() => followUpQueries.length).toBe(2);
  expect(followUpQueries).toEqual([created.id, created.id]);
});
