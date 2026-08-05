# GuessRack

A free two-player word guessing game in 3D. Both players see the same rack of
24 word cards; each of you is secretly assigned one word from it. You take turns
typing yes/no questions to each other ("Is it alive?", "Would it fit in a
backpack?"), knock down the cards the answers rule out, and race to name the
other player's word.

Each player plays on their own device — one creates a room, the other joins with
a 4-character code.

## Running it

```bash
npm install
```

**Development** (Vite dev server with hot reload + the game server):

```bash
npm run dev
```

Open <http://localhost:5173>. Both processes start together; the client proxies
its WebSocket to the game server on port 8787.

**Playing on your own network** (one process serves everything on port 8787):

```bash
npm start
```

That builds the client and serves it. The console prints your machine's network
addresses — the second player opens one of those, for example
`http://192.168.1.20:8787`, and enters the room code.

> `localhost` only works on the machine running the server. For the other
> device, use the network address. Windows may ask you to allow Node through the
> firewall the first time; allow it on private networks.

## Room rules

Whoever creates the room picks the rules, and they hold for the life of the
room. Both players see them on the waiting screen.

| Rule | Default | Effect |
| --- | --- | --- |
| Card language | **English** | Switch to `العربية` and the rack is drawn from the Arabic pool in `server/words.js` instead. Both players always share one rack, so the host picks once. |
| Show opponent's progress | **off** | When off, the opponent's remaining-card count is never sent to your browser at all — there is nothing to peek at. Turn it on to race a visible countdown. |
| Sudden death guessing | **off** | When off, a wrong call knocks that card down on your own board and passes the turn, so you can call as often as you like. Turn it on and one wrong call loses the match. |

Your own wrong-call count appears in the HUD once you have one (sudden death
aside, where there is never more than one).

## How a match goes

1. Player A hits **Create a room**, sets the rules, and reads the code to player B.
2. Player B enters it. Both racks deal in and each player sees their own secret
   word on the card held in the corner.
3. On your turn, type one yes/no question and send it. It appears on your
   opponent's screen and they answer **Yes**, **No**, or **Other…** and write
   their own reply. One question per turn, and it blocks the turn until it is
   answered.
4. Every exchange lands in a shared log — the **Log** button in the ask strip
   opens the full history, and the latest exchange always shows inline.
5. Click any card to knock it down (click again to stand it back up). Your
   knocked-down cards are private.
6. Hit **Pass turn** to hand over. Playing in the same room? Skip the typing,
   talk, and just pass the turn — nothing forces you to send a question.
7. When you're ready, hit **Call their word** on your turn and click the card you
   think is theirs.
8. Both players hit **Rematch** for a fresh board; the previous loser starts.

Refreshing the page, or dropping off Wi-Fi, puts you back in the same match —
the server holds your seat for five minutes.

## Layout

| Path | What it does |
| --- | --- |
| `server/index.js` | HTTP + WebSocket server, static files, cache headers |
| `server/rooms.js` | Room lifecycle, rules, turn order, secret words, guess resolution |
| `server/words.js` | The word pool boards are drawn from |
| `src/main.js` | Wires network state to the 3D scene and the HUD |
| `src/scene.js` | Renderer, camera framing, lighting, the held card |
| `src/board.js` | The card rack: layout, knock-down animation, hover, picking |
| `src/textures.js` | Canvas-drawn card faces, card backs, backdrop |
| `src/net.js` | WebSocket client, reconnect and seat restore |
| `src/ui.js` | Lobby, room rules, HUD, modals, toasts |
| `seo/` | Templates for robots.txt, sitemap.xml and llms.txt (`{{SITE_URL}}`) |
| `public/` | Manifest, icons, share image, plus the rendered `seo/` output |
| `scripts/make-seo.mjs` | Stamps the site URL into `seo/*` → `public/`, runs on every build |
| `scripts/make-images.mjs` | Regenerates the icons and share image (`npm run images`) |
| `render.yaml` | Render deployment blueprint — see below |
| `Dockerfile`, `fly.toml` | Fly.io deployment, as an alternative |

The server is authoritative: it owns the board, both secret words, whose turn it
is, and who won. Each client only ever receives its own secret and its own
knocked-down cards.

## Deploying to Render

The game needs a real Node process for the WebSocket server, so static hosts
(GitHub Pages, plain Netlify, Vercel functions) will not work. Render's free
plan needs no payment method and `render.yaml` in this repo is ready to go.

**Render deploys from a Git repo, so the code has to be on GitHub first:**

```bash
git init
git add -A
git commit -m "GuessRack"
gh repo create guessrack --public --source=. --push
```

Then in Render: **New → Blueprint**, pick the repo, and it reads `render.yaml`.
Your game is live at `https://<name>.onrender.com` with HTTPS and WebSockets
working out of the box — the client derives its socket URL from the page origin,
so `https://` becomes `wss://` automatically. Pushing to `main` redeploys.

Change `region` in `render.yaml` from `frankfurt` to whichever of `oregon`,
`frankfurt`, `singapore`, `ohio` or `virginia` is nearest your players. With a
single instance that is your entire latency story.

### The free plan's one real catch

**A free service spins down after ~15 minutes with no inbound traffic, and the
next visitor waits roughly 50 seconds for it to boot.** For this game that hurts
in a specific way: whoever opens the page first eats the wait, and by the time
they have a room code their friend is already asking what's wrong.

Two mitigations are already in the code:

- The client sends an application-level ping every 4 minutes for as long as a
  socket is open, so a long think between questions cannot idle the service out
  from under a match in progress.
- If the service *does* restart, all rooms are gone — they live in memory. The
  client now detects this specific case (the server tags the error `no_room`),
  clears its saved seat and drops both players back to the lobby with *"That
  match ended — the server restarted"*, instead of leaving a dead board on
  screen that no longer responds.

The third mitigation is external: point a free uptime monitor (UptimeRobot,
cron-job.org) at `https://<name>.onrender.com/health` every 10 minutes and the
service never sleeps. The free plan's 750 instance-hours per month covers one
service running continuously — a 30-day month is 720 hours — so a single
always-on service fits, with ~30 hours to spare. Check Render's current limits
before relying on that; free-tier terms change.

### Why one instance is a feature here

Rooms live in memory in a single process. If two instances ever ran, the two
players could be routed to different ones and each would sit forever waiting for
an opponent connected to the other. The free plan runs exactly one instance, so
this cannot happen. If you later upgrade and scale past one, room state has to
move into Redis first — adding instances without that will break matchmaking.

### Setting the public URL

The canonical link, Open Graph tags, JSON-LD, `robots.txt`, `sitemap.xml` and
`llms.txt` all get the site URL stamped in at build time from a single value.
Change it in **one place**, `render.yaml`:

```yaml
      - key: VITE_SITE_URL
        value: https://guessrack.com
```

then redeploy. Locally the same value comes from `.env`. Nothing else needs
editing — `scripts/make-seo.mjs` renders `seo/*` into `public/` on every build.

### Adding your own domain later

Render supports custom domains with free TLS on the free plan. In the dashboard:
**Settings → Custom Domains → Add**, then create the CNAME (or A record for an
apex domain) that Render shows you at your registrar. Afterwards update
`VITE_SITE_URL` in `render.yaml`, redeploy, and only then submit to Search
Console — see below.

### Alternative: Fly.io

`Dockerfile` and `fly.toml` are also included. Fly cold-starts in a second or
two rather than ~50, but it requires a card on file even for the free
allowance. If you get one later: `fly launch --ha=false --no-deploy`, then
`fly deploy`. The `--ha=false` matters — Fly defaults to two machines, which
breaks matchmaking for the reason above. The site URL comes from the `SITE_URL`
build arg in `fly.toml` there instead of from `render.yaml`.

Either way, the server binds without a host argument on purpose, so Node listens
on `::` in dual-stack mode and accepts both Render's IPv4 router and Fly's
private IPv6. Do not "fix" it to `0.0.0.0`.

### Before you go live

1. **Register the domain.** `guessrack.com` was unregistered when this was
   written — check it is still free before you rely on it. Cloudflare Registrar
   sells .com at cost.
2. **Set `VITE_SITE_URL`** in `render.yaml` as above, and redeploy.
3. **Submit to Google Search Console** and Bing Webmaster Tools: verify the
   domain, submit `https://yourdomain/sitemap.xml`, and request indexing of the
   home page. This is the step that actually gets you into search results —
   everything below only decides how well you place once you are there.
4. **Check the share card** by pasting the URL into the LinkedIn Post Inspector,
   Facebook Sharing Debugger, or just a Slack/WhatsApp message. It should render
   `og-image.png`.
5. **Run Lighthouse** in Chrome DevTools on the deployed URL and confirm SEO and
   Best Practices are at 100.

### What is already in place

**Classic SEO**

- A unique, keyword-led `<title>` and meta description sized to avoid truncation
- Canonical URL, `robots` directive with `max-image-preview:large`
- Open Graph and Twitter `summary_large_image` tags, plus a 1200×630 share image
- A single `<h1>` carrying the brand and the descriptive tagline, with a
  semantic `<main>`/`<section>`/`<h2>` outline underneath
- **Real indexable copy** — the how-to-play steps, the rules explainer and the
  FAQ are plain HTML in the served page, not painted into the canvas. A pure
  WebGL page gives crawlers nothing to rank; this gives them several hundred
  words that human visitors also want.
- `sitemap.xml` and a `robots.txt` that points at it
- A web manifest and full icon set, so it installs cleanly on mobile
- Fingerprinted assets cached for a year, HTML set to revalidate, and genuine
  404s instead of soft 404s — all three feed Core Web Vitals and crawl quality

**GEO / answer engines**

- `JSON-LD` `VideoGame` schema (players, price, platform, availability) so
  assistants can state the facts about the game without guessing
- `JSON-LD` `FAQPage` schema whose eight questions mirror the visible FAQ
  headings word for word — this is what gets quoted back in AI answers and can
  earn FAQ rich results
- `public/llms.txt`, the emerging convention for a plain-text, LLM-readable
  summary of a site: what the game is, how it works, the rules, and a short
  facts block
- `robots.txt` explicitly allows GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
  Claude-SearchBot, PerplexityBot, Google-Extended and Applebot-Extended.
  Several of these are opt-out crawlers, so saying yes explicitly is what makes
  the site eligible to be cited.
- Answer-shaped copy: every FAQ answer is a self-contained sentence that reads
  correctly when quoted on its own, which is how models excerpt.

### What still needs a human

Ranking for a new domain is mostly about links and time. Realistically:

- Submit to the places that index browser games — itch.io, CrazyGames, Poki,
  Newgrounds, and r/WebGames — each is a real backlink and real traffic.
- Post it to Hacker News ("Show HN"), r/boardgames and r/webdev.
- Do **not** chase "guess who online" as your main keyword; those results are
  locked up by established sites. Aim at the long tail your page already
  answers: *two player word guessing game online*, *guess who but with words*,
  *20 questions game with a friend online*, *free word deduction game browser*.
- Your brand term is trivially winnable — once you have a few links, you should
  own page one for "GuessRack" outright.

## Tweaking

- **Word lists** — edit `WORD_SETS` in `server/words.js`. Anything answerable
  with yes/no questions works; keep entries short enough to read on a card. In
  the Arabic pool, avoid words that differ only by a dot or a trailing letter
  (نحلة/نخلة, سحاب/سحابة) — two of those on one rack is a misread, not a
  deduction.
- **Adding a language** — add a pool to `WORD_SETS`, a matching entry to
  `SCRIPTS` in `src/textures.js` (font stack, direction, line height, and the
  "your word" label), and a radio button in the lobby's Room rules. Canvas hands
  text to the platform shaper, so any script that the OS fonts cover will join
  and order correctly on its own.
- **Board size** — `BOARD_SIZE` in `server/rooms.js`. It must match the grid in
  `src/scene.js` (`4 x 6` portrait, `6 x 4` landscape).
- **Look** — card colours and text live in `src/textures.js`; lighting and
  camera framing in `src/scene.js`.
- **Branding images** — edit `public/favicon.svg` or the share-card markup in
  `scripts/make-images.mjs`, then run `npm run images`.
