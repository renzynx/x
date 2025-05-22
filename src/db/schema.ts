import { randomUUID } from 'crypto';
import { relations, sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamps = {
  created_at: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updated_at: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
};

export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$default(() => randomUUID()),
  email: text('email').notNull().unique(),
  username: text('username').notNull(),
  avatar: text('avatar').notNull(),
  discord_id: text('discord_id').notNull(),
  access_token: text('access_token').notNull(),
  refresh_token: text('refresh_token').notNull(),
  token_expiry: integer('token_expiry', { mode: 'timestamp' }).notNull(),
  ...timestamps,
});

export const sessions = sqliteTable('sessions', {
  id: text('id')
    .primaryKey()
    .$default(() => randomUUID()),
  sid: text('sid').notNull().unique(),
  data: text('data').notNull(),
  expires_at: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

export const files = sqliteTable('files', {
  id: text('id')
    .primaryKey()
    .$default(() => randomUUID()),
  name: text('name').notNull(),
  size: integer('size').notNull(),
  type: text('type').notNull(),
  user_id: text('user_id').notNull(),
  total_chunks: integer('total_chunks').notNull(),
  ...timestamps,
});

export const chunks = sqliteTable('chunks', {
  id: text('id')
    .primaryKey()
    .$default(() => randomUUID()),
  file_id: text('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'cascade' }),
  chunk_number: integer('chunk_number').notNull(),
  url: text('url').notNull(),
  url_expiry: integer('url_expiry', { mode: 'timestamp' }).notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  files: many(files),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  user: one(users, {
    fields: [files.user_id],
    references: [users.id],
  }),
  chunks: many(chunks),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  file: one(files, {
    fields: [chunks.file_id],
    references: [files.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;
export type File = typeof files.$inferSelect;
export type InsertFile = typeof files.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type InsertChunk = typeof chunks.$inferInsert;
