# Tema Claro/Escuro — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light theme alternative to the existing dark UI, with a header sun/moon toggle, localStorage persistence, and dark as default. Email templates explicitly out of scope.

**Architecture:** Tailwind v4 `dark:` variants triggered by a `.dark` class on `<html>`. Light styles are the BASE classes (e.g. `bg-white`), dark variants are prefixed (`dark:bg-slate-900`). The `<html>` carries the `dark` class by default, so the app opens identical to today. A synchronous inline script in `index.html` reads `localStorage.theme` before React mounts to avoid a "flash of light theme." A small `useTheme` hook + `ThemeToggle` component handle runtime switching.

**Tech Stack:** React 18, Tailwind v4 (via `@tailwindcss/vite`), Vite, lucide-react. No new dependencies.

**Reference spec:** [docs/superpowers/specs/2026-05-18-tema-claro-escuro-design.md](../specs/2026-05-18-tema-claro-escuro-design.md)

---

## File map

### Created
```
frontend/src/
├── hooks/
│   └── useTheme.js                  # theme state + persistence
└── components/
    └── ThemeToggle.jsx              # sun/moon button for the header
```

### Modified
- `frontend/index.html` — inline script for synchronous init
- `frontend/src/index.css` — `@custom-variant dark` directive + light/dark body styles
- `frontend/src/App.jsx` — mount ThemeToggle in header
- `frontend/src/components/Tabs.jsx`
- `frontend/src/components/PrecosTab.jsx` (largest — ~318 lines)
- `frontend/src/components/StatusTab.jsx` (~195 lines)
- `frontend/src/components/StatusModal.jsx` (~91 lines)
- `frontend/src/components/StatusHistoryDrawer.jsx` (~77 lines)
- `frontend/src/components/SettingsModal.jsx` (~134 lines)
- `frontend/src/components/Toast.jsx` (~23 lines)

**Total:** 2 new files, 9 modified.

---

## Color mapping reference (cite this in every refactor task)

Every dark color class in the existing components must gain a light counterpart **as the base class** and the existing class becomes a `dark:` variant. Example:

```jsx
// before
<div className="bg-slate-900/40 border border-slate-800/50 text-slate-200">

// after
<div className="bg-white/80 border border-slate-200 text-slate-900
                dark:bg-slate-900/40 dark:border-slate-800/50 dark:text-slate-200">
```

**Mapping table** (matches spec §4):

| Function | Dark (current) | Light (new BASE) |
|---|---|---|
| Page (body) | `slate-950` | `slate-50` |
| Surface card | `bg-slate-900/40 border-slate-800/50` | `bg-white/80 border-slate-200` |
| Main panel | `bg-slate-900/60 border-slate-700/50` | `bg-white border-slate-200` |
| Modal/Drawer | `bg-slate-900/60` (backdrop-blur kept) | `bg-white border-slate-200` |
| Modal overlay | `bg-slate-950/80` | `bg-slate-900/50` |
| Table header bg | `bg-slate-900/80 text-slate-400` | `bg-slate-50 text-slate-500` |
| Text primary | `text-slate-100/200` | `text-slate-900` |
| Text secondary | `text-slate-400` | `text-slate-600` |
| Text muted | `text-slate-500/600` | `text-slate-400/500` |
| Input bg | `bg-slate-800/50 border-slate-700` | `bg-white border-slate-300` |
| Input text | `text-slate-100 placeholder-slate-400` | `text-slate-900 placeholder-slate-400` |
| Primary button (indigo) | `bg-indigo-600` (unchanged) | `bg-indigo-600` (unchanged) |
| Row hover | `hover:bg-slate-800/30` | `hover:bg-slate-100/60` |
| Divider | `divide-slate-800/50` | `divide-slate-200` |
| Badge emerald | `bg-emerald-500/10 text-emerald-400 border-emerald-500/20` | `bg-emerald-100 text-emerald-700 border-emerald-200` |
| Badge amber | `bg-amber-500/10 text-amber-400 border-amber-500/20` | `bg-amber-100 text-amber-700 border-amber-200` |
| Badge red | `bg-red-500/10 text-red-400 border-red-500/20` | `bg-red-100 text-red-700 border-red-200` |
| Badge orange | `bg-orange-500/10 text-orange-400 border-orange-500/20` | `bg-orange-100 text-orange-700 border-orange-200` |
| Badge purple | `bg-purple-500/10 text-purple-400 border-purple-500/20` | `bg-purple-100 text-purple-700 border-purple-200` |
| Badge blue | `bg-blue-500/10 text-blue-400 border-blue-500/20` | `bg-blue-100 text-blue-700 border-blue-200` |
| Title gradient | `from-white to-slate-400` | `from-slate-900 to-slate-500` |
| Icon button bg (header/actions) | `bg-slate-800/60 hover:bg-slate-700` + `text-slate-400 hover:text-white` | `bg-slate-100 hover:bg-slate-200` + `text-slate-600 hover:text-slate-900` |
| Border (header/Toast outer) | `border-slate-700/50` | `border-slate-200` |

**Rule of thumb:**
- For every `slate-*` color class, add the light counterpart per the table above.
- Indigo (the brand accent) stays the same in both themes — do **not** add a light variant for `indigo-*` color classes.
- For `*-500/10` (low-opacity neon background) → flip to `*-100` solid pastel.
- For `text-*-400` on those backgrounds → flip to `text-*-700`.
- Backdrop-blur is kept in both themes (it works on both).

---

## Phase 1 — Infrastructure

### Task 1.1: CSS variant + light body styles

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add `@custom-variant dark` directive and light body styles**

Replace the entire content of `frontend/src/index.css` with:

```css
@import "tailwindcss";

/* Enable .dark class-based dark mode (Tailwind v4 syntax). */
@custom-variant dark (&:where(.dark, .dark *));

@layer base {
  body {
    /* Light is the base theme. */
    background-color: theme(colors.slate.50);
    color: theme(colors.slate.900);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    background-image:
      radial-gradient(circle at 15% 50%, rgba(99, 102, 241, 0.05) 0%, transparent 50%),
      radial-gradient(circle at 85% 30%, rgba(168, 85, 247, 0.05) 0%, transparent 50%);
    background-attachment: fixed;
  }

  .dark body {
    background-color: theme(colors.slate.950);
    color: theme(colors.slate.100);
    background-image:
      radial-gradient(circle at 15% 50%, rgba(99, 102, 241, 0.08) 0%, transparent 50%),
      radial-gradient(circle at 85% 30%, rgba(168, 85, 247, 0.08) 0%, transparent 50%);
  }

  ::selection {
    background-color: rgba(99, 102, 241, 0.3);
  }
}

/* Custom Scrollbar (light base, dark override) */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: rgba(241, 245, 249, 0.5);
}
::-webkit-scrollbar-thumb {
  background: rgba(203, 213, 225, 0.8);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 1);
}

.dark ::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.5);
}
.dark ::-webkit-scrollbar-thumb {
  background: rgba(51, 65, 85, 0.8);
}
.dark ::-webkit-scrollbar-thumb:hover {
  background: rgba(71, 85, 105, 1);
}

/* Modal animation */
@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.modal-animate {
  animation: modal-in 0.2s ease-out;
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd frontend && npm run build`
Expected: Build completes without errors.

> Note: at this point the `<html>` does not yet have the `dark` class, so opening the app would show the light theme. That's expected — Task 1.2 adds the init script.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(frontend): add dark variant directive and light body styles"
```

---

### Task 1.2: Inline init script (anti-flash)

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Read the current `index.html` to see exact insertion point**

Read `frontend/index.html`. Find the line `<script type="module" src="/src/main.jsx"></script>`.

- [ ] **Step 2: Insert the inline init script immediately before it**

Add this script tag immediately before the `<script type="module" src="/src/main.jsx"></script>` line, inside the `<body>`:

```html
    <script>
      try {
        if ((localStorage.getItem('theme') || 'dark') === 'dark') {
          document.documentElement.classList.add('dark');
        }
      } catch (e) {
        // Safari private mode: localStorage throws. Default to dark.
        document.documentElement.classList.add('dark');
      }
    </script>
```

- [ ] **Step 3: Verify the build still succeeds**

Run: `cd frontend && npm run build`
Expected: Build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html
git commit -m "feat(frontend): apply theme class before React mounts to avoid flash"
```

---

### Task 1.3: useTheme hook

**Files:**
- Create: `frontend/src/hooks/useTheme.js`

- [ ] **Step 1: Create the hook**

The `frontend/src/hooks/` directory does not exist yet — create it on the way. Then create `frontend/src/hooks/useTheme.js`:

```js
import { useState, useCallback, useEffect } from 'react';

function readInitialTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function persist(theme) {
  try {
    localStorage.setItem('theme', theme);
  } catch (e) {
    // Safari private mode: localStorage throws. Persistence is best-effort.
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(readInitialTheme);

  // Keep <html> class in sync (init script handles the very first paint;
  // this effect handles state updates after mount).
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      persist(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
```

- [ ] **Step 2: Verify the build still succeeds**

Run: `cd frontend && npm run build`
Expected: Build completes without errors. (The hook is not yet imported anywhere, but Vite shouldn't complain.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useTheme.js
git commit -m "feat(frontend): add useTheme hook with localStorage persistence"
```

---

### Task 1.4: ThemeToggle component

**Files:**
- Create: `frontend/src/components/ThemeToggle.jsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/ThemeToggle.jsx`:

```jsx
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark';
  // Icon and tooltip describe the ACTION (target state), not current state.
  return (
    <button
      onClick={onToggle}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
      aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      className="p-2.5 rounded-lg transition-colors cursor-pointer border
                 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200
                 dark:bg-slate-800/60 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-white dark:border-slate-700/50"
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
```

- [ ] **Step 2: Verify the build still succeeds**

Run: `cd frontend && npm run build`
Expected: Build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ThemeToggle.jsx
git commit -m "feat(frontend): add ThemeToggle sun/moon button"
```

---

### Task 1.5: Wire ThemeToggle into App.jsx header

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Read current `frontend/src/App.jsx`**

Read the file to see the current header structure. The Settings button currently sits alone at the right of the header:

```jsx
<button onClick={()=>setSettingsOpen(true)} className="p-2.5 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer border border-slate-700/50" title="Configurações">
  <Settings className="w-5 h-5" />
</button>
```

- [ ] **Step 2: Add imports and wire the hook**

At the top of `App.jsx`, add to the existing imports:

```jsx
import { useTheme } from './hooks/useTheme';
import ThemeToggle from './components/ThemeToggle';
```

Inside the `App` function, after the existing `useState(...)` calls, add:

```jsx
const { theme, toggleTheme } = useTheme();
```

- [ ] **Step 3: Render ThemeToggle in the header (to the left of Settings)**

Replace the standalone Settings button in the header with a `<div>` wrapping both:

```jsx
<div className="flex items-center gap-2">
  <ThemeToggle theme={theme} onToggle={toggleTheme} />
  <button onClick={()=>setSettingsOpen(true)} className="p-2.5 rounded-lg transition-colors cursor-pointer border
                                                          bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200
                                                          dark:bg-slate-800/60 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-white dark:border-slate-700/50" title="Configurações">
    <Settings className="w-5 h-5" />
  </button>
</div>
```

> The Settings button also gets its light/dark pair applied here so the two buttons look consistent. The rest of App.jsx still has dark-only classes — those land in Task 2.1.

- [ ] **Step 4: Verify the build succeeds AND test the toggle in a browser**

Run: `cd frontend && npm run build`
Expected: Build OK.

(Optional but recommended) Run the dev server and open the app:
```bash
cd backend && AVIATION_API_MODE=stub node server.js   # in one terminal
cd frontend && npm run dev                            # in another
```

Click the new sun/moon button. The icon should swap, and `<html class="dark">` should toggle in DevTools. Note: most of the UI is **still dark-only** at this point — only the body bg and the two icon buttons in the header switch. Other components light up in Phase 2.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(frontend): wire ThemeToggle and useTheme into App header"
```

---

## Phase 2 — Component refactors

**Approach for every task in this phase:**

1. Open the component file.
2. For every JSX `className` containing a color class from the mapping table (above), add the LIGHT counterpart as the **base** class. Keep the existing dark class but **prefix it with `dark:`**.
3. Indigo, white, and transparent classes stay unchanged.
4. After saving, run `cd frontend && npm run build` to verify nothing is syntactically broken.
5. Commit per the message at the end of the task.

**Verification after each task:** open the app in a browser (or dev server), toggle the theme via the header button, and confirm the touched component looks correct in both modes — text legible, no white-on-white or black-on-black, borders visible.

If a class doesn't appear in the mapping table (a one-off color you don't know how to map), apply judgment using the rule of thumb:
- `*-500/10` background → `*-100` solid in light
- `text-*-400` → `text-*-700` in light
- Indigo accents → unchanged

If still unsure, leave a `// TODO(theme): unsure how to map` comment and continue. Surface those in the final review.

---

### Task 2.1: App.jsx body refactor

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Apply mapping to remaining classes in App.jsx**

Specific targets in App.jsx:
- The `h1` title gradient: `from-white to-slate-400` → `from-slate-900 to-slate-500 dark:from-white dark:to-slate-400`.
- The `p` subtitle: `text-slate-400` → `text-slate-600 dark:text-slate-400`.
- The logo `img` border: `border-indigo-500/30` → leave indigo unchanged.

The header structure should look like:

```jsx
<header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
  <div className="flex items-center gap-3">
    <img src={logo} alt="Clube do Voo" className="w-14 h-14 rounded-full object-cover border-2 border-indigo-500/30 shadow-lg shadow-indigo-500/20" />
    <div>
      <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-500 bg-clip-text text-transparent dark:from-white dark:to-slate-400">Monitoramento de Voos Prime</h1>
      <p className="text-slate-600 text-sm mt-1 dark:text-slate-400">Painel administrativo de passagens aéreas monitoradas</p>
    </div>
  </div>
  <div className="flex items-center gap-2">
    <ThemeToggle theme={theme} onToggle={toggleTheme} />
    <button onClick={()=>setSettingsOpen(true)} className="p-2.5 rounded-lg transition-colors cursor-pointer border
                                                            bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200
                                                            dark:bg-slate-800/60 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-white dark:border-slate-700/50" title="Configurações">
      <Settings className="w-5 h-5" />
    </button>
  </div>
</header>
```

- [ ] **Step 2: Build + visual check**

```bash
cd frontend && npm run build
```

Optionally run dev server, toggle theme, confirm the header looks good both ways.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(frontend): apply light theme variants to App.jsx header"
```

---

### Task 2.2: Tabs.jsx refactor

**Files:**
- Modify: `frontend/src/components/Tabs.jsx`

- [ ] **Step 1: Apply mapping**

Open the file. The component is small (~20 lines). Update the outer wrapper and inactive tab classes per the mapping. Indigo classes on the ACTIVE tab stay unchanged.

Specific edits (the entire `className` strings on the wrapper and the inactive branch):

```jsx
// outer wrapper
className="flex gap-1 rounded-xl p-1 mb-6 border
           bg-white/80 border-slate-200
           dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-slate-800/50"

// active tab — UNCHANGED
'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'

// inactive tab
'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60'
```

- [ ] **Step 2: Build + visual check + commit**

```bash
cd frontend && npm run build
git add frontend/src/components/Tabs.jsx
git commit -m "feat(frontend): apply light theme variants to Tabs"
```

---

### Task 2.3: Toast.jsx refactor

**Files:**
- Modify: `frontend/src/components/Toast.jsx`

- [ ] **Step 1: Apply mapping**

Open the file (~23 lines). Apply mapping to the variant classes — they currently use `bg-*-500/10 text-*-400 border-*-500/20` patterns. Convert each variant to a light/dark pair:

| Variant | Light base | Dark variant |
|---|---|---|
| success | `bg-emerald-100 text-emerald-700 border-emerald-200` | `dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20` |
| error | `bg-red-100 text-red-700 border-red-200` | `dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20` |
| warning | `bg-amber-100 text-amber-700 border-amber-200` | `dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20` |
| info | `bg-blue-100 text-blue-700 border-blue-200` | `dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20` |

(Adapt names to whatever variants the file actually defines — read the file first.)

- [ ] **Step 2: Build + visual check + commit**

```bash
cd frontend && npm run build
git add frontend/src/components/Toast.jsx
git commit -m "feat(frontend): apply light theme variants to Toast"
```

---

### Task 2.4: StatusHistoryDrawer.jsx refactor

**Files:**
- Modify: `frontend/src/components/StatusHistoryDrawer.jsx`

- [ ] **Step 1: Apply mapping**

Open the file (~77 lines). Targets:
- Overlay backdrop `bg-slate-950/80` → `bg-slate-900/50 dark:bg-slate-950/80`
- Drawer panel `bg-slate-900 border-l border-slate-700/50` → `bg-white border-l border-slate-200 dark:bg-slate-900 dark:border-slate-700/50`
- Sticky header `bg-slate-900/95 backdrop-blur-xl ... border-slate-700/50` → `bg-white/95 backdrop-blur-xl border-slate-200 dark:bg-slate-900/95 dark:border-slate-700/50`
- Title `text-white` → `text-slate-900 dark:text-white`
- Helper subtitle `text-slate-400` → `text-slate-600 dark:text-slate-400`
- Close button → use the same pattern as the header icon buttons (see Task 1.5 Step 3).
- Timeline ring/ball `bg-slate-900 ring-4 ring-slate-900` → `bg-white ring-4 ring-white dark:bg-slate-900 dark:ring-slate-900`
- Timeline border-l `border-slate-700` → `border-slate-200 dark:border-slate-700`
- Event timestamp `text-slate-500` → `text-slate-500 dark:text-slate-500` (slate-500 reads OK on both)
- "notificado" badge `text-emerald-400` → `text-emerald-600 dark:text-emerald-400`
- Diff list `text-slate-400` → `text-slate-600 dark:text-slate-400`
- Each EVENT_META color (`text-red-400`, `text-amber-400`, etc.) stays as the icon tint but needs a light variant too: `text-red-700 dark:text-red-400`, etc. Apply per the badge color mapping in the reference table.

> The EVENT_META object hardcodes Tailwind color classes. Update the object so each entry's `color` is the combined "light dark" string, e.g.:
> ```js
> cancelado: { icon: XCircle, color: 'text-red-700 dark:text-red-400', label: 'Cancelado' },
> ```

- [ ] **Step 2: Build + visual check + commit**

```bash
cd frontend && npm run build
git add frontend/src/components/StatusHistoryDrawer.jsx
git commit -m "feat(frontend): apply light theme variants to StatusHistoryDrawer"
```

---

### Task 2.5: StatusModal.jsx refactor

**Files:**
- Modify: `frontend/src/components/StatusModal.jsx`

- [ ] **Step 1: Apply mapping**

Open the file (~91 lines). Targets:
- Overlay `bg-slate-950/80` → `bg-slate-900/50 dark:bg-slate-950/80`
- Modal panel `bg-slate-900/60 backdrop-blur-xl border-slate-700/50` → `bg-white border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50`
- Header border `border-slate-700/50` → `border-slate-200 dark:border-slate-700/50`
- Title `text-white` → `text-slate-900 dark:text-white`
- Close button → header icon button pattern
- Labels `text-slate-300` → `text-slate-700 dark:text-slate-300`
- `inputCls` constant — change to:
  ```js
  const inputCls = "w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border " +
                   "bg-white text-slate-900 placeholder-slate-400 border-slate-300 " +
                   "dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700";
  ```
- Error text `text-red-400` → `text-red-700 dark:text-red-400`
- Cancel button `bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white` → `bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white`
- Submit button (indigo) — unchanged.
- Footer border `border-slate-700/50` → `border-slate-200 dark:border-slate-700/50`
- Select `<option>` `bg-slate-900` — drop the inline bg (lets browser pick correct color) OR pair: `bg-white dark:bg-slate-900`.

- [ ] **Step 2: Build + visual check + commit**

```bash
cd frontend && npm run build
git add frontend/src/components/StatusModal.jsx
git commit -m "feat(frontend): apply light theme variants to StatusModal"
```

---

### Task 2.6: StatusTab.jsx refactor

**Files:**
- Modify: `frontend/src/components/StatusTab.jsx`

- [ ] **Step 1: Apply mapping**

Open the file (~195 lines). High-level targets:
- "Monitorar Voo" button (indigo) — unchanged.
- `StatCard` inner: `bg-slate-900/40 backdrop-blur-xl border-slate-800/50` → `bg-white/80 border-slate-200 dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-slate-800/50`
- StatCard icon container `bg-indigo-500/10 text-indigo-400 border-indigo-500/20` → leave indigo unchanged.
- StatCard text classes (`text-slate-400`, `text-white`) → pair per mapping.
- Main `<main>` panel `bg-slate-900/60 backdrop-blur-xl border-slate-700/50` → `bg-white border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50`
- `<thead>` row `bg-slate-900/80 border-slate-800 text-slate-400` → `bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-400`
- `<tbody>` divider `divide-slate-800/50` → `divide-slate-200 dark:divide-slate-800/50`
- Row hover `hover:bg-slate-800/30` → `hover:bg-slate-100/60 dark:hover:bg-slate-800/30`
- Loading/empty state text `text-slate-400` and icon `text-slate-600` → pair per mapping
- Cell text `text-slate-200/300` → `text-slate-900 dark:text-slate-200/300` (depending on which weight)
- "pausado" muted text `text-slate-600` → `text-slate-400 dark:text-slate-600`
- Action button cluster (`bg-slate-800 hover:bg-*-500/20 text-slate-400`) → pair each variant:
  - Refresh button (amber accent): `bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 dark:bg-slate-800 dark:hover:bg-amber-500/20 dark:text-slate-400 dark:hover:text-amber-400`
  - History button (purple accent): same pattern with purple
  - Toggle pause/play button: neutral pattern (no accent color change)
  - Edit button (blue accent): same pattern with blue
  - Delete button (red accent): same pattern with red
- `STATUS_STYLES` map — each entry's `color` becomes a combined string:
  ```js
  scheduled: { color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20', ... },
  // ... same pattern for active/delayed/cancelled/diverted/landed
  ```
- Delayed-arrow span `text-amber-400` → `text-amber-700 dark:text-amber-400`

- [ ] **Step 2: Build + visual check + commit**

```bash
cd frontend && npm run build
git add frontend/src/components/StatusTab.jsx
git commit -m "feat(frontend): apply light theme variants to StatusTab"
```

---

### Task 2.7: SettingsModal.jsx refactor

**Files:**
- Modify: `frontend/src/components/SettingsModal.jsx`

- [ ] **Step 1: Read file and apply mapping**

Open the file (~134 lines). Treat as a modal: same overlay/panel/border/title/input/buttons patterns as StatusModal (Task 2.5). Section headers, labels, inputs, save/cancel buttons all get the same pair treatment.

If the file has unusual elements (status indicator dots, badges), use the rule-of-thumb mapping: `*-500/10` → `*-100`, `text-*-400` → `text-*-700`.

- [ ] **Step 2: Build + visual check + commit**

```bash
cd frontend && npm run build
git add frontend/src/components/SettingsModal.jsx
git commit -m "feat(frontend): apply light theme variants to SettingsModal"
```

---

### Task 2.8: PrecosTab.jsx refactor (largest file)

**Files:**
- Modify: `frontend/src/components/PrecosTab.jsx`

This is the biggest file (~318 lines) but the refactor pattern is identical to StatusTab.jsx.

- [ ] **Step 1: Apply mapping**

Specific patterns to look for and pair:
- "Novo Voo" button (indigo) — unchanged.
- StatCard equivalents — same pattern as StatusTab.
- Main panel + thead/tbody/rows — same pattern as StatusTab.
- Priority badge color map (`getPriorityColor`): each branch returns a string like `bg-red-500/10 text-red-400 border border-red-500/20` — convert each to a combined light+dark string:
  ```js
  case 'Urgente': return 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20';
  ```
  Same pattern for Alta (orange), Média (amber), Baixa (emerald), default (slate).
- Drag-handle column `text-slate-500 group-hover:text-slate-300` → `text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300`
- Cliente cell `font-semibold text-slate-200` → `text-slate-900 dark:text-slate-200`
- Sub-info cell `text-xs text-slate-400` with sub-icons `text-slate-500` → pair both
- "✓ ALERTA" badge `bg-emerald-500/20 text-emerald-400 border-emerald-500/30` → `bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30`
- Mono price text classes (`text-emerald-400`, `text-slate-300`, `text-slate-600`) → pair per mapping
- Check toggle button (active=`text-indigo-400 bg-indigo-500/10`, inactive=`text-slate-500 bg-slate-800`) — for the inactive state apply mapping; for active state leave indigo unchanged.
- "MARCAR ALL" button — apply mapping
- Drag-over highlight `bg-indigo-500/10 opacity-30` — keep indigo, unchanged
- Action button cluster — same pattern as StatusTab (refresh/history/toggle/edit/delete)
- Flight modal (the inline edit modal in this file) — apply same pattern as StatusModal (overlay, panel, border, title, labels, inputs, buttons)
- Section header inside modal `text-xs text-slate-500 uppercase` → `text-slate-500 dark:text-slate-500` (slate-500 is fine on both)

- [ ] **Step 2: Build + visual check + commit**

```bash
cd frontend && npm run build
git add frontend/src/components/PrecosTab.jsx
git commit -m "feat(frontend): apply light theme variants to PrecosTab"
```

---

## Phase 3 — Verification

### Task 3.1: Full visual smoke test

- [ ] **Step 1: Start backend (stub mode) and frontend dev server**

```bash
cd backend && AVIATION_API_MODE=stub node server.js   # terminal A
cd frontend && npm run dev                            # terminal B
```

Open `http://localhost:5173`.

- [ ] **Step 2: Smoke test in DARK mode (default)**

Confirm the app opens looking visually identical to before the feature landed.

- [ ] Header, logo, title gradient OK.
- [ ] Tabs OK (Preços active, Status inactive).
- [ ] PrecosTab: stat cards, table headers, rows, all action buttons, "Novo Voo" modal — all readable.
- [ ] Switch to StatusTab: stat cards, table, action buttons, "Monitorar Voo" modal, history drawer — all readable.
- [ ] Toast (e.g., trigger by creating a duplicate) — readable.
- [ ] Settings modal — readable.

If anything looks broken in dark mode, the refactor accidentally changed a dark class. Fix and re-test.

- [ ] **Step 3: Click the sun icon → switch to LIGHT**

Confirm:

- [ ] Body background goes light, gradients subtle.
- [ ] Header logo/title/buttons all readable; no white-on-white.
- [ ] Tabs: active tab still indigo, inactive readable on light.
- [ ] PrecosTab + StatusTab: tables, badges, all action buttons readable. Hover states still work.
- [ ] All modals (Novo Voo, Editar, Settings, Monitorar): inputs visible, borders crisp, no black-on-black.
- [ ] StatusHistoryDrawer: timeline icons + text readable.
- [ ] Toast: success/error/warning colors readable on light.

If you find any black-on-black, white-on-white, or invisible borders in light mode, the class was missed. Fix and re-test.

- [ ] **Step 4: Reload the page in LIGHT mode**

Confirm:

- [ ] No "flash" of dark before light appears (init script worked).
- [ ] App stays in light mode after reload (localStorage worked).

- [ ] **Step 5: Toggle back to dark, reload again**

Confirm:

- [ ] No flash.
- [ ] Stays dark.

- [ ] **Step 6: Open in a fresh private window**

Confirm:

- [ ] App opens in dark (default for first-time visit).

- [ ] **Step 7: Run a production build to make sure nothing is broken**

```bash
cd frontend && npm run build
```

Expected: clean build, no warnings about unused or broken classes.

- [ ] **Step 8: Run backend test suite (sanity check)**

```bash
cd backend && npm test
```

Expected: 40/40 PASS (this feature doesn't touch backend, but verify no regression).

- [ ] **Step 9: Commit if any leftover fixes were made**

```bash
git status
# If clean, skip. Otherwise:
git add -A && git commit -m "fix(frontend): polish light theme coverage"
```

---

## Done criteria (mirror of spec §8)

- [ ] First visit opens dark — visually identical to pre-feature state.
- [ ] Sun/moon toggle in header, to the left of Settings.
- [ ] Toggle alternates immediately, no reload.
- [ ] Choice persists across reload (localStorage).
- [ ] No flash between page load and React mount.
- [ ] All components readable in both themes (WCAG AA contrast minimum).
- [ ] Tabs Preços and Status both covered in both modes.
- [ ] Emails unchanged (no regression).
- [ ] Behavior unchanged — only color.
- [ ] Safari private mode: app opens dark, no crash.

## Reference

- Spec: [docs/superpowers/specs/2026-05-18-tema-claro-escuro-design.md](../specs/2026-05-18-tema-claro-escuro-design.md)
- Tailwind v4 dark mode: https://tailwindcss.com/docs/dark-mode
