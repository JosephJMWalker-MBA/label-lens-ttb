import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema, isSQLite } from "@/db/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: isSQLite ? "sqlite" : "mysql",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
  },
  session: {
    expiresIn: 7 * 24 * 60 * 60, // 7 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  // Map additional fields to User model
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "seller",
      },
      passwordHash: {
        type: "string",
      },
    },
  },
});
