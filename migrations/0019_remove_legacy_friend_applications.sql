-- Friend-link applications are now represented by comments on the friends
-- page. The 0018 compatibility table is no longer part of the runtime model.
-- Dropping this child table does not touch its source comments or authors.
DROP TABLE IF EXISTS legacy_friend_applications_v1;
