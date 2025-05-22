import { PassportSerializer } from '@nestjs/passport';
import { eq } from 'drizzle-orm';
import { db, User, users } from 'src/db';
import { Done } from 'src/types';

export class SessionSerializer extends PassportSerializer {
  constructor() {
    super();
  }
  serializeUser(user: User, done: Done) {
    return done(null, user.id);
  }

  async deserializeUser(user_id: string, done: Done) {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, user_id));

      return user ? done(null, user) : done(null, null);
    } catch (err) {
      done(err, null);
    }
  }
}
