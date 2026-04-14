import { z } from "zod";
import type { FC } from "hono/jsx";
import { AuthNavActions } from "../components/AuthNavActions.js";

export const homePagePropsSchema = z.object({
  domain: z.string().min(1),
  isLoggedIn: z.boolean(),
});

export type HomePageProps = z.infer<typeof homePagePropsSchema>;

export const HomePage: FC<HomePageProps> = z
  .function()
  .args(homePagePropsSchema)
  .returns(z.custom<ReturnType<FC<HomePageProps>>>())
  .implement(({ domain, isLoggedIn }) => {
    return (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Secret Detector</title>
          <link rel="stylesheet" href="/assets/app.css" />
        </head>
        <body class="min-h-screen bg-background font-sans text-foreground">
          <div class="mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-6">
            <header class="py-6">
              <div class="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                <strong class="text-lg text-foreground">Secret Detector</strong>
                {isLoggedIn ? (
                  <a
                    href="/domains"
                    class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Go to app
                  </a>
                ) : (
                  <AuthNavActions mode="auth" />
                )}
              </div>
            </header>

            {/* eslint-disable-next-line custom/ds-no-unapproved-class-tokens -- ds-exception: UI-102 | flex-1 centers hero within viewport below header */}
            <section class="flex flex-1 items-center justify-center py-8">
              <div class="w-full max-w-4xl rounded-xl border border-border bg-card p-5 sm:p-6">
                <div class="mb-6 space-y-2 text-center">
                  <h1 class="text-3xl font-semibold text-foreground">
                    Scan websites for exposed secrets
                  </h1>
                  <p class="text-base text-muted-foreground">
                    Enter any public URL to run a security scan.
                  </p>
                </div>
                <form
                  id="scan-form"
                  action="/scan"
                  method="post"
                  class="flex gap-3"
                >
                  <input
                    id="visitorFingerprint"
                    name="visitorFingerprint"
                    type="hidden"
                    value=""
                  />
                  <input
                    id="domain"
                    name="domain"
                    type="text"
                    required
                    placeholder="Enter any URL to scan"
                    value={`${domain}/sandbox/demo`}
                    class="w-full rounded-xl border border-border bg-background px-4 py-2 text-base text-foreground"
                  />
                  <button
                    type="submit"
                    class="shrink-0 cursor-pointer rounded-xl bg-primary px-6 py-2 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Scan now
                  </button>
                </form>
              </div>
            </section>
          </div>
          <script type="module" src="/assets/scan-fingerprint.js"></script>
        </body>
      </html>
    );
  });
