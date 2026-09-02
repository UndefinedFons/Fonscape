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
