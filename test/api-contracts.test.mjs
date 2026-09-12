import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/[[path]].js";
import { migratedDatabase, requestContext, seedUser } from "./helpers/runtime-database.mjs";

async function requestJson({ path, query = "", method = "GET", db, currentUser, body, headers = {} }) {
  const context = requestContext({ path, query, method, db, currentUser, body, headers });
  const response = await onRequest(context);
  const payload = await response.json();
  await context.settle();
  return { response, payload };
}

function contract(value, description) {
  assert.equal(value && typeof value === "object", true, description);
}

test("session, comments, replies, deletion, and errors keep their response contracts", async () => {
  const { client, db } = await migratedDatabase();
  try {
    const now = Date.now();
    const member = await seedUser(client, { now });
    await client.execute({
      sql: `INSERT INTO comments (id, user_id, body, status, content_type, content_slug, parent_id, reply_to_comment_id, reply_to_user_id, created_at, updated_at)
        VALUES ('comment-1', ?, '已发布', 'published', 'post', 'site-friends', NULL, NULL, NULL, ?, ?)`,
      args: [member.id, now, now],
    });

    const session = await requestJson({ path: ["auth", "session"], db, currentUser: member });
    contract(session.payload.user, "session user contract");
    assert.deepEqual(Object.keys(session.payload.user).sort(), [
      "avatarUpdatedAt", "avatarUrl", "createdAt", "id", "nickname", "role", "status", "unreadAdminComments", "unreadReplies", "username",
    ]);
    assert.equal(session.payload.user.id, member.id);
    assert.equal(session.payload.user.nickname, member.nickname);

    const listed = await requestJson({ path: ["comments"], query: "?type=post&slug=site-friends", db, currentUser: member });
    assert.equal(listed.response.status, 200);
    contract(listed.payload, "comment list contract");
    assert.deepEqual(Object.keys(listed.payload).sort(), ["comments", "page", "pageSize", "total", "totalPages"]);
    assert.deepEqual(listed.payload.comments.map((comment) => ({
      id: comment.id,
      parentId: comment.parentId,
      replyTo: comment.replyTo,
      replyToUser: comment.replyToUser,
      authorId: comment.author.id,
      authorNickname: comment.author.nickname,
      updatedAt: comment.updatedAt,
      editedAt: comment.editedAt,
    })), [{
      id: "comment-1",
      parentId: null,
      replyTo: null,
      replyToUser: null,
      authorId: member.id,
      authorNickname: member.nickname,
      updatedAt: now,
      editedAt: null,
    }]);

    const created = await requestJson({
      path: ["comments"], method: "POST", db, currentUser: member,
      body: { type: "post", slug: "site-friends", body: "契约测试" },
    });
    assert.equal(created.response.status, 201);
    contract(created.payload.comment, "comment creation contract");
    assert.deepEqual(Object.keys(created.payload.comment).sort(), [
      "author", "body", "canDelete", "createdAt", "editedAt", "id", "parentId", "replyTo", "replyToUser", "status", "updatedAt",
    ]);
    assert.deepEqual(Object.keys(created.payload.comment.author).sort(), ["avatarUpdatedAt", "avatarUrl", "id", "nickname", "role"]);
    assert.equal(created.payload.comment.body, "契约测试");
    assert.equal(created.payload.comment.parentId, null);
    assert.equal(created.payload.comment.replyTo, null);
    assert.equal(created.payload.comment.replyToUser, null);
    assert.equal(created.payload.comment.author.id, member.id);
    assert.equal(created.payload.comment.author.nickname, member.nickname);
    assert.equal(created.payload.comment.editedAt, null);
    assert.equal(typeof created.payload.comment.updatedAt, "number");
    assert.equal(created.payload.comment.updatedAt, created.payload.comment.createdAt);

    const reply = await requestJson({
      path: ["comments"], method: "POST", db, currentUser: member,
      body: { type: "post", slug: "site-friends", body: "契约回复", parentId: created.payload.comment.id },
    });
    assert.equal(reply.response.status, 201);
    contract(reply.payload.comment.replyToUser, "reply target user contract");
    assert.deepEqual(Object.keys(reply.payload.comment.replyToUser).sort(), ["avatarUpdatedAt", "avatarUrl", "id", "nickname"]);
    assert.equal(typeof reply.payload.comment.parentId, "string");
    assert.equal(reply.payload.comment.parentId, created.payload.comment.id);
    assert.equal(reply.payload.comment.replyTo, member.nickname);
    assert.equal(reply.payload.comment.replyToUser.id, member.id);
    assert.equal(reply.payload.comment.replyToUser.nickname, member.nickname);

    const deleted = await requestJson({
      path: ["comments", created.payload.comment.id], method: "DELETE", db, currentUser: member,
    });
    assert.equal(deleted.response.status, 200);
    assert.deepEqual(deleted.payload, { ok: true });

    const invalid = await requestJson({
      path: ["comments"], method: "POST", db, currentUser: member,
      body: { type: "post", slug: "site-friends", body: "" },
    });
    assert.equal(invalid.response.status, 400);
    assert.deepEqual(Object.keys(invalid.payload).sort(), ["code", "error"]);
  } finally {
    await client.close();
  }
});
