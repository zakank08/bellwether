# Election night: where live results are stored (one-time setup, ~15 minutes)

The website is a set of fixed pages, so live numbers are kept in a separate public "bucket" that the browser reads
every 15 seconds. We use **Cloudflare R2**: free storage, **free downloads** (so a huge crowd cannot run up a bill or
use up the site's Vercel allowance), and it has no cost at this size.

## Steps (you do these; nothing here goes in chat)
1. Go to https://dash.cloudflare.com and sign up (free). Pick the **Free** plan.
2. Left menu: **R2 Object Storage** → **Create bucket**. Name it `bellwether-live`. Location: Automatic. Click **Create bucket**.
   (R2 asks for a card to turn on; the free tier of 10 GB and millions of reads is far more than needed.)
3. Open the bucket → **Settings** → **Public access** → under **r2.dev subdomain** click **Allow Access** and confirm. Copy the address shown (looks like `https://pub-abc123.r2.dev`).
4. Same page → **CORS policy** → **Add**, paste this and save:
   ```json
   [{"AllowedOrigins": ["*"], "AllowedMethods": ["GET"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 10}]
   ```
5. Back at **R2 Object Storage** (main page) → **Manage R2 API Tokens** → **Create API token**. Permission: **Object Read & Write**. Bucket: `bellwether-live` only. Create. The next page shows an **Access Key ID** and a **Secret Access Key** (shown once). Also note your **Account ID** (right side of the R2 page).
6. In GitHub: repo **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Create four, one at a time:
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (the value of the last is `bellwether-live`).
7. In Vercel: project **Settings** → **Environment Variables** → add `NEXT_PUBLIC_LIVE_URL` = the address from step 3 plus `/live` (for example `https://pub-abc123.r2.dev/live`), for Production. Then **Deployments** → latest → **Redeploy**.
8. Tell Claude when done. Claude will run the rehearsal through it and check the site reads it.

Never paste the Secret Access Key in chat. If it ever leaks, delete the token in Cloudflare and make a new one.

## Traffic and cost (measured Oct. 1)
- A home page visit is about **0.4 MB** of downloads (compressed). Vercel's free plan includes 100 GB a month, which is roughly **150,000–250,000 visits**, fewer if people click through many pages.
- Live numbers come from R2, not Vercel, so refreshing every 15 seconds does not use the Vercel allowance.
- If you expect more than ~100,000 visitors on election night: either upgrade Vercel to Pro for November ($20/month, 1 TB), or move the pages to Cloudflare Pages (free, unlimited bandwidth). Claude can do the move in an afternoon. Decision date: Oct. 20.
- Vercel's free plan is for non-commercial use. If the site ever carries ads or sells anything, use Pro.
