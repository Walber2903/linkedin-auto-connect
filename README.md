# LinkedIn Auto-Connect (Chrome Extension)

Safely automate **Connect** clicks on LinkedIn **search results** to speed up relevant networking — with conservative limits, smart modal handling, and pagination.

> ⚠️ **Disclaimer**  
> Automating interactions on LinkedIn may violate the platform’s Terms of Service.  
> Use **for educational purposes only**, at your own risk. Avoid spam. Keep invite rates **very low**.

---

## ✨ Features

- Works on LinkedIn **search result** pages: `https://www.linkedin.com/search/results*`
- **Safe defaults**: per-page and per-run caps to reduce risk
- **Auto-pagination**: moves to the next page and continues
- **Smart modals**: confirms simple sends; **skips** email-gated flows
- **Multi-language detection**: “Connect/Conectar/Invite/…”
- **Clean cancellation**: cancellable timers + run token (`runId`)
- **SPA-aware**: `MutationObserver` watches results updates
- **Console debug logs**: easy to diagnose with `[LI-AutoConnect]`

---

## 🧠 How it works (quick view)

1. Scans result cards and finds visible **Connect** buttons.  
2. Clicks with **human-like random delays**.  
3. **Confirms** simple modals; **skips** when email is required.  
4. Sends up to **N invites per page** (configurable).  
5. Clicks **Next page** and repeats until hitting the page cap.

---

## 🚀 Install (Developer Mode)

1. **Download** this repository to your computer.  
1. Open `chrome://extensions/` in Google Chrome.  
1. Turn **Developer mode** ON (top-right).  
   
   <img width="184" height="41" alt="Enable Developer Mode" src="https://github.com/user-attachments/assets/fd1bb4e6-843a-4241-aa26-2d51ade03f60" />
1. Click **Load unpacked** and select the **project folder**.  
   
   <img width="533" height="196" alt="Load Unpacked" src="https://github.com/user-attachments/assets/fc488509-5679-4f1b-a289-cda074cc717b" />
1. Ensure the extension is **On**.  
   
   <img width="438" height="261" alt="Extension On" src="https://github.com/user-attachments/assets/56105973-056b-49a6-8746-876b9b6e968b" />

---

## 🕹️ Usage

1. Run a **LinkedIn search** to find the people you want to connect with (filters by title, location, etc.).  
   
   <img width="1028" height="186" alt="LinkedIn Search" src="https://github.com/user-attachments/assets/290dcdb3-b5f2-451c-ab9f-1d8abe5d5376" />
1. Toggle the extension **On** to start automating invites on the current results.  
   
   <img width="355" height="223" alt="Extension Toggle" src="https://github.com/user-attachments/assets/8ee5a953-5291-4904-880a-c73ceb3b9e96" />

> 💡 **Tip**: keep the page **visible** to help lazy-loaded results render.

---

## ⚙️ Configuration

Main knobs live in `CONFIG` inside `content.js`.

```js
const CONFIG = {
  // Pacing (milliseconds)
  DELAYS: {
    CONNECT_CLICK_MIN: 800,
    CONNECT_CLICK_MAX: 1500,
    PAGE_CHANGE_MIN: 1200,
    PAGE_CHANGE_MAX: 2500,
    DIALOG_APPEAR_TIMEOUT: 5000,
    RESULTS_CHANGE_TIMEOUT: 12000
  },

  // Safety caps
  MAX_INVITES_PER_PAGE: 8,   // small & conservative
  MAX_PAGES_PER_RUN: 3,      // small & conservative

  // Keywords (lowercased tokens; add/remove for your locale)
  KW: {
    CONNECT: ['connect', 'conectar', 'invite', 'invitar', 'convidar', 'connecter', 'connetti', 'verbinden'],
    PENDING: ['pending', 'pendente', 'pendiente', 'en attente'],
    MESSAGE: ['message', 'mensagem', 'mensaje', 'messaggio'],
    FOLLOW:  ['follow', 'seguir', 'suivre', 'segui']
  },

  // Optional fallback selector for obfuscated layouts
  SELECTORS: {
    OB_CONTAINER: 'div.trMOuCrxGuyMcoBfUoxZIQAILvdyMtzfftN.SbIBLepHrzBVCRarZbIJSiSzqpwqueZ'
  },

  // General behavior
  DEBUG: true
};
```

> ✅ **Recommendation**: increase limits **gradually** and watch the console (F12) for `[LI-AutoConnect]` logs.

---

## 🧩 Compatibility

- Chromium-based browsers (**Chrome**, **Brave**, **Edge**) in Developer Mode  
- **LinkedIn Search Results** pages (not feed, not arbitrary profile pages)

---

## 🛠️ Project Structure

```text
linkedin-auto-connect/
├─ background/service-worker.json
├─ manifest.json
├─ content/content.js                # core logic: detection, clicks, pagination, modal handling
└─ popup/popup.html/.js/.css         # (optional) UI to toggle on/off
```

---

## 🧯 Troubleshooting

- **“It triggers on page 2 and 3, but not on page 1.”**  
  Page 1 often “hydrates” components. The script waits for render signals, rescans, and performs a **light auto-scroll** as a fallback.  
  If it still doesn’t detect:
  - increase `RESULTS_CHANGE_TIMEOUT` to **15–18s**
  - ensure your locale is covered in `CONFIG.KW`
  - check if results only show **Message/Follow** (ignored)

- **Email-gated invite dialog**  
  The script **closes and skips** by design.

- **Nothing happens**  
  - Confirm the URL matches `https://www.linkedin.com/search/results*`
  - Open DevTools (F12) and look for `[LI-AutoConnect]` logs
  - Make sure `DEBUG: true`, refresh the page, and try again

---

## 🧭 Roadmap

- Dynamic pacing based on page load/latency  
- Stats panel (invites sent, pages processed)  
- Extra filters (e.g., exclude titles/companies)

---

## 📜 License

**MIT** — feel free to use and modify.  
You may change the license to whatever fits your needs.

---

## 🧾 Responsibility Statement

This project is **not** affiliated with, endorsed by, or maintained by LinkedIn.  
Please **do not** use it for spam. Respect people, rate limits, and LinkedIn’s Terms of Service.
