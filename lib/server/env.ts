import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  RESEND_API_KEY: z.string().startsWith("re_"),
  RESEND_FROM: z.string().min(3),
  BUSINESS_EMAIL: z.email(),
  PUBLIC_SITE_URL: z.url(),
  CRON_SECRET: z.string().min(20),
  // Google Calendar — optional; all three required together to enable the integration
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REFRESH_TOKEN: z.string().min(1).optional(),
  GOOGLE_CALENDAR_ID: z.string().min(1).optional(),
});

let parsedEnv: z.infer<typeof envSchema> | undefined;

export function getEnv() {
  if (!parsedEnv) {
    parsedEnv = envSchema.parse(process.env);
  }
  return parsedEnv;
}
