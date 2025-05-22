/* eslint-disable @typescript-eslint/no-misused-promises */
import * as session from 'express-session';
import { eq, lt } from 'drizzle-orm';
import { LibSQLDatabase } from 'drizzle-orm/libsql';
import { Session, sessions } from '../db/schema';

export interface DrizzleSessionStoreOptions {
  db: LibSQLDatabase<any>;
  ttl?: number;
  autoCleanup?: boolean;
  cleanupInterval?: number;
}

export class DrizzleSessionStore extends session.Store {
  private db: LibSQLDatabase<any>;
  private ttl: number;
  private cleanupInterval: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: DrizzleSessionStoreOptions) {
    super();

    this.db = options.db;
    this.ttl = options.ttl || 86400; // 1 day in seconds
    this.cleanupInterval = options.cleanupInterval || 900000; // 15 minutes

    if (options.autoCleanup !== false) {
      this.startCleanup();
    }
  }

  private startCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((err) => {
        console.error('Session store cleanup error:', err);
      });
    }, this.cleanupInterval);

    // Make sure the cleanup interval doesn't prevent the process from exiting
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  private async cleanup(): Promise<void> {
    const now = new Date();
    await this.db.delete(sessions).where(lt(sessions.expires_at, now));
  }

  get = async (
    sid: string,
    callback: (err: any, session?: session.SessionData | null) => void,
  ): Promise<void> => {
    try {
      const result = await this.db
        .select()
        .from(sessions)
        .where(eq(sessions.sid, sid))
        .limit(1);

      if (!result.length) {
        return callback(null, null);
      }

      const sessionRow = result[0] as Session;

      if (new Date() > new Date(sessionRow.expires_at)) {
        await this.destroy(sid, () => {});
        return callback(null, null);
      }

      let sessionData;
      try {
        sessionData = JSON.parse(sessionRow.data);
      } catch {
        return callback(new Error('Failed to parse session data'));
      }

      callback(null, sessionData);
    } catch (err) {
      callback(err);
    }
  };

  set = async (
    sid: string,
    sessionData: session.SessionData,
    callback?: (err?: any) => void,
  ): Promise<void> => {
    try {
      const expiresAt = new Date(Date.now() + this.ttl * 1000);

      const exists = await this.db
        .select()
        .from(sessions)
        .where(eq(sessions.sid, sid))
        .limit(1);

      if (exists.length) {
        await this.db
          .update(sessions)
          .set({
            data: JSON.stringify(sessionData),
            expires_at: expiresAt,
          })
          .where(eq(sessions.sid, sid));
      } else {
        await this.db.insert(sessions).values({
          sid: sid,
          data: JSON.stringify(sessionData),
          expires_at: expiresAt,
        });
      }

      if (callback) callback();
    } catch (err) {
      if (callback) callback(err);
    }
  };

  destroy = async (
    sid: string,
    callback?: (err?: any) => void,
  ): Promise<void> => {
    try {
      await this.db.delete(sessions).where(eq(sessions.sid, sid));

      if (callback) callback();
    } catch (err) {
      if (callback) callback(err);
    }
  };

  touch = async (
    sid: string,
    sessionData: session.SessionData,
    callback?: (err?: any) => void,
  ): Promise<void> => {
    try {
      const expiresAt = new Date(Date.now() + this.ttl * 1000);

      await this.db
        .update(sessions)
        .set({
          expires_at: expiresAt,
        })
        .where(eq(sessions.sid, sid));

      if (callback) callback();
    } catch (err) {
      if (callback) callback(err);
    }
  };

  // Optional methods
  all = async (
    callback: (
      err: any,
      sessions?: { [sid: string]: session.SessionData } | null,
    ) => void,
  ): Promise<void> => {
    try {
      const result = await this.db.select().from(sessions);

      const sessionsMap: { [sid: string]: session.SessionData } = {};

      for (const row of result) {
        try {
          sessionsMap[row.sid] = JSON.parse(row.data);
        } catch {
          console.error(`Failed to parse session data for sid: ${row.sid}`);
        }
      }

      callback(null, sessionsMap);
    } catch (err) {
      callback(err);
    }
  };

  length = async (
    callback: (err: any, length?: number) => void,
  ): Promise<void> => {
    try {
      const result = await this.db
        .select({ count: sessions.id })
        .from(sessions);

      callback(null, result.length);
    } catch (err) {
      callback(err);
    }
  };

  clear = async (callback?: (err?: any) => void): Promise<void> => {
    try {
      await this.db.delete(sessions);

      if (callback) callback();
    } catch (err) {
      if (callback) callback(err);
    }
  };
}
