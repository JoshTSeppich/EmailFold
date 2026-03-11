import { useState, useCallback, useEffect, useRef } from "react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:           "#f8fafc",
  surface:      "#ffffff",
  border:       "#e2e8f0",
  borderFocus:  "#a5b4fc",
  text:         "#0f172a",
  textSub:      "#475569",
  textMuted:    "#94a3b8",
  accent:       "#4F46E5",
  accentHover:  "#4338CA",
  accentBg:     "#EEF2FF",
  accentBorder: "#C7D2FE",
  green:        "#059669",
  greenBg:      "#ECFDF5",
  greenBorder:  "#A7F3D0",
  amber:        "#D97706",
  amberBg:      "#FFFBEB",
  amberBorder:  "#FDE68A",
  red:          "#DC2626",
  redBg:        "#FEF2F2",
  redBorder:    "#FECACA",
  violet:       "#7C3AED",
  violetBg:     "#F5F3FF",
  violetBorder: "#DDD6FE",
  pink:         "#DB2777",
  pinkBg:       "#FDF2F8",
  pinkBorder:   "#FBCFE8",
  shadow:       "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  shadowMd:     "0 4px 6px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)",
  radius:       8,
  radiusSm:     6,
};

const FOXWORKS_PITCH = `Foxworks Studios is an AI engineering collective that builds custom AI automations, MCP server integrations, and autonomous agent workflows for B2B companies. We turn high-repetition ops workflows into AI-powered systems — without requiring clients to hire or expand an in-house engineering team. Typical engagements: AI-powered document processing, customer communication automation, CRM enrichment pipelines, and custom LLM tooling. Average engagement: 6–12 weeks, $25K–$80K.`;

const EMAIL_GOALS = [
  { value: "cold_intro",   label: "Cold Introduction" },
  { value: "follow_up",    label: "Follow-Up" },
  { value: "partnership",  label: "Partnership Inquiry" },
  { value: "demo_request", label: "Request a Demo" },
];

const ANGLE_COLORS = {
  "Pain Point Hook":   { color: T.red,    bg: T.redBg,    border: T.redBorder },
  "Recent News Hook":  { color: T.amber,  bg: T.amberBg,  border: T.amberBorder },
  "Tech Stack Hook":   { color: T.violet, bg: T.violetBg, border: T.violetBorder },
};

const LS_KEY_API     = "emailfold_apikey";
const LS_KEY_PRODUCT = "emailfold_product";
const LS_KEY_HISTORY = "emailfold_history";
const LS_KEY_SENDER  = "emailfold_sender";

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function extractJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end   = clean.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(clean.slice(start, end + 1)); }
  catch { return null; }
}

// ── UI Primitives ─────────────────────────────────────────────────────────────
function CopyButton({ text, label = "Copy", successLabel = "Copied!" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{
        background:   copied ? T.greenBg  : T.accentBg,
        border:      `1px solid ${copied ? T.greenBorder : T.accentBorder}`,
        color:        copied ? T.green    : T.accent,
        borderRadius: T.radiusSm,
        padding:      "4px 12px",
        fontSize:     12,
        fontWeight:   600,
        cursor:       "pointer",
        fontFamily:   "inherit",
        transition:   "all 0.15s",
        whiteSpace:   "nowrap",
      }}
    >
      {copied ? successLabel : label}
    </button>
  );
}

function Tag({ children, color = T.accent, bg = T.accentBg, border = T.accentBorder }) {
  return (
    <span style={{
      background: bg, color, border: `1px solid ${border}`,
      borderRadius: 4, padding: "3px 9px", fontSize: 12, fontWeight: 500,
      display: "inline-block", margin: "2px 3px 2px 0",
    }}>
      {children}
    </span>
  );
}

function SectionHeader({ title, accent = T.accent, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: accent,
        textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ display: "inline-block", width: 3, height: 14, background: accent, borderRadius: 2 }} />
        {title}
      </div>
      {action}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: T.radius, padding: "18px 20px",
      marginBottom: 12, boxShadow: T.shadow, ...style,
    }}>
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: T.textMuted,
      letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

// ── Email Card ────────────────────────────────────────────────────────────────
function EmailCard({ email }) {
  const [expanded, setExpanded] = useState(true);
  const cfg = ANGLE_COLORS[email.angle] || { color: T.accent, bg: T.accentBg, border: T.accentBorder };
  const fullText = `Subject: ${email.subject}\n\n${email.body}`;

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: T.radius, marginBottom: 12, boxShadow: T.shadow, overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", cursor: "pointer",
          borderBottom: expanded ? `1px solid ${T.border}` : "none",
          background: expanded ? "#fcfcfd" : T.surface,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{
            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
            borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700,
            letterSpacing: "0.05em", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {email.angle}
          </span>
          <span style={{
            fontSize: 13, fontWeight: 600, color: T.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {email.subject}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 12 }}>
          <CopyButton text={fullText} label="Copy" />
          <span style={{
            fontSize: 14, color: T.textMuted,
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.15s", display: "inline-block",
          }}>▾</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "16px 18px" }}>
          <div style={{
            background: T.bg, border: `1px solid ${T.border}`,
            borderRadius: T.radiusSm, padding: "14px 16px", marginBottom: 10,
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontSize: 14, lineHeight: 1.7, color: T.text, whiteSpace: "pre-wrap",
          }}>
            {email.body}
          </div>
          {email.why && (
            <p style={{ fontSize: 12, color: T.textMuted, margin: 0, fontStyle: "italic" }}>
              <strong style={{ color: T.textSub }}>Why this angle:</strong> {email.why}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Research Panel ────────────────────────────────────────────────────────────
function ResearchPanel({ research }) {
  const [open, setOpen] = useState(false);
  if (!research) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "none", border: `1px solid ${T.border}`,
          borderRadius: T.radiusSm, padding: "6px 12px",
          fontSize: 12, color: T.textSub, cursor: "pointer",
          fontFamily: "inherit", fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6,
          marginBottom: open ? 10 : 0,
        }}
      >
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
        Company Intelligence
      </button>

      {open && (
        <Card>
          {research.company_overview && (
            <div style={{ marginBottom: 14 }}>
              <FieldLabel>Overview</FieldLabel>
              <p style={{ margin: 0, fontSize: 13, color: T.text, lineHeight: 1.6 }}>{research.company_overview}</p>
              {(research.size || research.stage) && (
                <div style={{ marginTop: 8 }}>
                  {research.size  && <Tag color={T.accent} bg={T.accentBg} border={T.accentBorder}>{research.size}</Tag>}
                  {research.stage && <Tag color={T.violet} bg={T.violetBg} border={T.violetBorder}>{research.stage}</Tag>}
                </div>
              )}
            </div>
          )}

          {research.tech_stack?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <FieldLabel>Tech Stack</FieldLabel>
              <div>{research.tech_stack.map((t, i) => <Tag key={i} color={T.green} bg={T.greenBg} border={T.greenBorder}>{t}</Tag>)}</div>
            </div>
          )}

          {research.recent_news?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <FieldLabel>Recent News</FieldLabel>
              {research.recent_news.map((n, i) => (
                <div key={i} style={{
                  padding: "8px 10px", background: T.amberBg,
                  border: `1px solid ${T.amberBorder}`, borderRadius: T.radiusSm, marginBottom: 6,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{n.headline}</div>
                  {n.significance && <div style={{ fontSize: 12, color: T.textSub, marginTop: 2 }}>{n.significance}</div>}
                  {n.date && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{n.date}</div>}
                </div>
              ))}
            </div>
          )}

          {research.pain_points?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <FieldLabel>Pain Points</FieldLabel>
              {research.pain_points.map((p, i) => (
                <div key={i} style={{
                  fontSize: 12, color: T.text, padding: "4px 0 4px 10px",
                  borderLeft: `2px solid ${T.redBorder}`, marginBottom: 4,
                }}>{p}</div>
              ))}
            </div>
          )}

          {research.buying_signals?.length > 0 && (
            <div style={{ marginBottom: research.culture_signals?.length ? 14 : 0 }}>
              <FieldLabel>Buying Signals</FieldLabel>
              {research.buying_signals.map((s, i) => (
                <div key={i} style={{
                  fontSize: 12, color: T.text, padding: "4px 0 4px 10px",
                  borderLeft: `2px solid ${T.greenBorder}`, marginBottom: 4,
                }}>{s}</div>
              ))}
            </div>
          )}

          {research.culture_signals?.length > 0 && (
            <div>
              <FieldLabel>Culture Signals</FieldLabel>
              {research.culture_signals.map((s, i) => (
                <div key={i} style={{
                  fontSize: 12, color: T.text, padding: "4px 0 4px 10px",
                  borderLeft: `2px solid ${T.accentBorder}`, marginBottom: 4,
                }}>{s}</div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Sidebar Input ─────────────────────────────────────────────────────────────
function SideInput({ label, value, onChange, placeholder, type = "text" }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.textSub, marginBottom: 4 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%", boxSizing: "border-box",
          border: `1px solid ${focused ? T.borderFocus : T.border}`,
          borderRadius: T.radiusSm, padding: "7px 10px",
          fontSize: 12, color: T.text, background: T.surface,
          outline: "none", fontFamily: "inherit", transition: "border-color 0.15s",
        }}
      />
    </div>
  );
}

function Divider() {
  return <hr style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "16px 0" }} />;
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [apiKey,        setApiKey]        = useState(() => localStorage.getItem(LS_KEY_API)     || "");
  const [senderName,    setSenderName]    = useState(() => localStorage.getItem(LS_KEY_SENDER)  || "");
  const [senderProduct, setSenderProduct] = useState(() => localStorage.getItem(LS_KEY_PRODUCT) || FOXWORKS_PITCH);
  const [companyName,   setCompanyName]   = useState("");
  const [companyUrl,    setCompanyUrl]    = useState("");
  const [contactName,   setContactName]   = useState("");
  const [contactRole,   setContactRole]   = useState("");
  const [emailGoal,     setEmailGoal]     = useState("cold_intro");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [phase,    setPhase]    = useState("");
  const [research, setResearch] = useState(null);
  const [emails,   setEmails]   = useState(null);
  const [history,  setHistory]  = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY_HISTORY) || "[]"); }
    catch { return []; }
  });
  const abortRef = useRef(null);

  useEffect(() => { localStorage.setItem(LS_KEY_API,     apiKey);        }, [apiKey]);
  useEffect(() => { localStorage.setItem(LS_KEY_PRODUCT, senderProduct); }, [senderProduct]);
  useEffect(() => { localStorage.setItem(LS_KEY_SENDER,  senderName);    }, [senderName]);
  useEffect(() => { localStorage.setItem(LS_KEY_HISTORY, JSON.stringify(history)); }, [history]);

  const stop = () => {
    if (abortRef.current) abortRef.current.abort();
    setLoading(false);
    setPhase("");
  };

  const run = useCallback(async () => {
    if (!companyName.trim()) { setError("Enter a company name."); return; }
    if (!apiKey.trim())      { setError("Add your Anthropic API key first."); return; }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setResearch(null);
    setEmails(null);
    setPhase(`Researching ${companyName}...`);

    // ── Phase 1: Web Search Research ─────────────────────────────────────────
    let researchData = null;
    try {
      const researchPrompt = `You are a B2B sales intelligence researcher for Foxworks Studios, an AI engineering collective.

TARGET: ${companyName}${companyUrl ? `\nURL: ${companyUrl}` : ""}

Use web search to build a complete company intelligence dossier. Search for all of the following:
1. Company overview — what they do, market position, key products/services
2. Size and funding stage — headcount, funding rounds, investors, revenue signals
3. Tech stack — job postings, engineering blog, GitHub repos, any tech mentions in press
4. Recent news (last 6 months) — funding, launches, expansions, exec hires, layoffs, partnerships, press coverage
5. Pain points — challenges mentioned in press, Glassdoor reviews, case studies, industry pressures
6. Buying signals — evidence they are investing in tech, automation, or AI

Return a JSON object with this exact structure:
{
  "company_overview": "2-3 sentence description of what they do and market position",
  "size": "employee headcount estimate e.g. '50-200 employees'",
  "stage": "startup | growth | enterprise | public | unknown",
  "tech_stack": ["technology1", "technology2"],
  "recent_news": [
    { "headline": "string", "significance": "why this matters for a sales approach", "date": "approx date" }
  ],
  "pain_points": ["specific pain point observable from public data"],
  "buying_signals": ["observable signal suggesting appetite for AI/automation investment"],
  "culture_signals": ["team or culture observation from LinkedIn, press, or website"]
}

Return ONLY valid JSON. No preamble, no markdown fences.`;

      const r1 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "web-search-2025-03-05",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 4000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: researchPrompt }],
        }),
      });

      if (r1.ok) {
        const d1 = await r1.json();
        const text = d1.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
        researchData = extractJSON(text);
        if (researchData) {
          setResearch(researchData);
          setPhase("Research complete — drafting emails...");
        }
      }
    } catch (e) {
      if (e?.name === "AbortError") { setLoading(false); return; }
      setPhase("Web research unavailable — drafting from training data...");
      await new Promise(r => setTimeout(r, 600));
    }

    // ── Phase 2: Email Drafting ───────────────────────────────────────────────
    const goalLabel = EMAIL_GOALS.find(g => g.value === emailGoal)?.label || emailGoal;

    const draftPrompt = `You are a world-class B2B copywriter working for Foxworks Studios, an AI engineering collective.

COMPANY INTEL:
${researchData ? JSON.stringify(researchData, null, 2) : `Company: ${companyName}${companyUrl ? `\nURL: ${companyUrl}` : ""}`}

RECIPIENT:${contactName ? `\nName: ${contactName}` : " Not specified"}${contactRole ? `\nRole/Title: ${contactRole}` : ""}

OUR OFFERING:
${senderProduct}

EMAIL GOAL: ${goalLabel}
SENDER SIGNATURE: ${senderName || "[Your Name]"} — Foxworks Studios

Write 3 personalized outbound email variants, each using a different angle. Each email must feel handcrafted by someone who actually read about this company — not AI-generated.

ANGLE 1 — "Pain Point Hook"
Lead with a specific, observable pain point from the company research. Demonstrate you understand their operational reality before mentioning what you offer.

ANGLE 2 — "Recent News Hook"
Reference something specific that recently happened at this company (funding, product launch, exec hire, expansion, press mention). Connect that event to why you're reaching out now.

ANGLE 3 — "Tech Stack Hook"
Open with a specific observation about their engineering choices or technical decisions. Position what Foxworks builds as something that complements or extends their existing stack.

EMAIL RULES (non-negotiable):
- Max 120 words per body
- First sentence must be specific to this company — no generic openers
- Banned phrases: "I hope this finds you well", "I came across your company", "I wanted to reach out", "I'm writing to", "Hope you're doing well"
- One clear, low-friction CTA at the end (15-minute call, a question to reply to, a specific ask)
- Peer-to-peer register — you're a practitioner talking to another practitioner
- Be specific: name technologies, metrics, events, team signals — avoid generic AI buzzwords

Return ONLY this JSON structure:
{
  "emails": [
    {
      "angle": "Pain Point Hook",
      "subject": "subject line (under 8 words, specific, no clickbait)",
      "body": "full email body",
      "why": "one sentence: why this angle is the right play for this specific company"
    },
    {
      "angle": "Recent News Hook",
      "subject": "subject line",
      "body": "full email body",
      "why": "one sentence explanation"
    },
    {
      "angle": "Tech Stack Hook",
      "subject": "subject line",
      "body": "full email body",
      "why": "one sentence explanation"
    }
  ]
}

Return ONLY valid JSON. No preamble, no markdown fences.`;

    try {
      const r2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 4000,
          messages: [{ role: "user", content: draftPrompt }],
        }),
      });

      if (!r2.ok) {
        const errData = await r2.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API error ${r2.status}`);
      }

      const d2 = await r2.json();
      const text = d2.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const parsed = extractJSON(text);
      if (!parsed?.emails?.length) throw new Error("Couldn't parse email output — try again.");

      const entry = {
        id: Date.now(),
        companyName, companyUrl, contactName, contactRole, emailGoal,
        research: researchData, emails: parsed.emails, ts: Date.now(),
      };
      setEmails(parsed.emails);
      setHistory(h => [entry, ...h].slice(0, 25));
      setPhase("");
    } catch (e) {
      if (e?.name === "AbortError") { setLoading(false); return; }
      setError(e.message || "Generation failed.");
    } finally {
      setLoading(false);
    }
  }, [apiKey, companyName, companyUrl, contactName, contactRole, emailGoal, senderProduct, senderName]);

  const loadHistoryEntry = (entry) => {
    setCompanyName(entry.companyName || "");
    setCompanyUrl(entry.companyUrl  || "");
    setContactName(entry.contactName || "");
    setContactRole(entry.contactRole || "");
    setEmailGoal(entry.emailGoal   || "cold_intro");
    setResearch(entry.research || null);
    setEmails(entry.emails   || null);
    setError(null);
    setPhase("");
  };

  const goalLabel = EMAIL_GOALS.find(g => g.value === emailGoal)?.label || emailGoal;
  const hasResults = !loading && (research || emails);

  return (
    <div style={{
      minHeight: "100vh", height: "100vh", background: T.bg,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* macOS title bar drag region */}
      <div style={{ WebkitAppRegion: "drag", height: 38, flexShrink: 0, background: T.surface, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ height: "100%", display: "flex", alignItems: "center", paddingLeft: 80 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.textSub, letterSpacing: "-0.01em" }}>
            <span style={{ color: T.accent }}>Email</span>Fold
          </span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── LEFT SIDEBAR ───────────────────────────────────────────────────── */}
        <div style={{
          width: 300, flexShrink: 0, borderRight: `1px solid ${T.border}`,
          background: T.surface, overflowY: "auto", padding: "20px 18px",
          display: "flex", flexDirection: "column",
        }}>
          {/* API Key */}
          <div style={{ marginBottom: 4 }}>
            <FieldLabel>Anthropic API Key</FieldLabel>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{
                width: "100%", boxSizing: "border-box",
                border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                padding: "7px 10px", fontSize: 12, color: T.text,
                background: T.bg, outline: "none", fontFamily: "inherit",
              }}
            />
          </div>

          <Divider />

          <FieldLabel>Target Company</FieldLabel>
          <SideInput label="Company Name *" value={companyName} onChange={setCompanyName} placeholder="Acme Corp" />
          <SideInput label="Website URL"    value={companyUrl}  onChange={setCompanyUrl}  placeholder="https://acmecorp.com" />

          <Divider />

          <FieldLabel>Contact (optional)</FieldLabel>
          <SideInput label="Name" value={contactName} onChange={setContactName} placeholder="Jane Smith" />
          <SideInput label="Role" value={contactRole} onChange={setContactRole} placeholder="VP of Engineering" />

          <Divider />

          <FieldLabel>Email Config</FieldLabel>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.textSub, marginBottom: 4 }}>Goal</label>
            <select
              value={emailGoal}
              onChange={e => setEmailGoal(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                padding: "7px 10px", fontSize: 12, color: T.text,
                background: T.surface, outline: "none", fontFamily: "inherit",
              }}
            >
              {EMAIL_GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>

          <SideInput label="Your Name" value={senderName} onChange={setSenderName} placeholder="Josh Tseppich" />

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.textSub, marginBottom: 4 }}>
              Your Offering
            </label>
            <textarea
              value={senderProduct}
              onChange={e => setSenderProduct(e.target.value)}
              rows={6}
              style={{
                width: "100%", boxSizing: "border-box",
                border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                padding: "7px 10px", fontSize: 11, color: T.text, lineHeight: 1.5,
                background: T.surface, outline: "none", fontFamily: "inherit", resize: "vertical",
              }}
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={loading ? stop : run}
            style={{
              background:   loading ? T.redBg  : T.accent,
              color:        loading ? T.red    : "#fff",
              border:       loading ? `1px solid ${T.redBorder}` : "none",
              borderRadius: T.radiusSm,
              padding:      "10px 0",
              fontSize:     13,
              fontWeight:   700,
              cursor:       "pointer",
              fontFamily:   "inherit",
              letterSpacing: "0.02em",
              transition:   "background 0.15s",
            }}
          >
            {loading ? "Stop" : "Generate Emails"}
          </button>

          {error && (
            <div style={{
              marginTop: 10, padding: "8px 12px",
              background: T.redBg, border: `1px solid ${T.redBorder}`,
              borderRadius: T.radiusSm, fontSize: 12, color: T.red,
            }}>
              {error}
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <FieldLabel>History</FieldLabel>
              {history.map(entry => (
                <div
                  key={entry.id}
                  onClick={() => loadHistoryEntry(entry)}
                  style={{
                    padding: "7px 10px", borderRadius: T.radiusSm,
                    cursor: "pointer", marginBottom: 4,
                    border: `1px solid ${T.border}`, background: T.bg,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = T.accentBg}
                  onMouseLeave={e => e.currentTarget.style.background = T.bg}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{entry.companyName}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{timeAgo(entry.ts)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── MAIN PANEL ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
          {/* Loading state */}
          {loading && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              background: T.accentBg, border: `1px solid ${T.accentBorder}`,
              borderRadius: T.radius, padding: "14px 18px", marginBottom: 24,
            }}>
              <div style={{
                width: 16, height: 16,
                border: `2px solid ${T.accent}`, borderTopColor: "transparent",
                borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>
                {phase || "Working..."}
              </span>
            </div>
          )}

          {/* Empty state */}
          {!loading && !research && !emails && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", minHeight: 420, textAlign: "center",
              color: T.textMuted,
            }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>✉</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.textSub, marginBottom: 6 }}>
                Research-backed email drafts
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 340 }}>
                Enter a company name — EmailFold will search the web for intelligence,
                then draft 3 personalized email variants tuned to different angles.
              </div>
            </div>
          )}

          {/* Results */}
          {hasResults && (
            <>
              {/* Company header */}
              <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.02em" }}>
                  {companyName}
                </h1>
                {companyUrl && (
                  <a
                    href={companyUrl}
                    onClick={e => {
                      e.preventDefault();
                      const openFn = window.electronAPI?.openExternal;
                      if (openFn) openFn(companyUrl);
                      else window.open(companyUrl, "_blank");
                    }}
                    style={{ fontSize: 12, color: T.accent, textDecoration: "none" }}
                  >
                    {companyUrl}
                  </a>
                )}
                {(contactName || contactRole) && (
                  <div style={{ marginTop: 6, fontSize: 13, color: T.textSub }}>
                    {contactName && <span style={{ fontWeight: 600 }}>{contactName}</span>}
                    {contactName && contactRole && " · "}
                    {contactRole && <span>{contactRole}</span>}
                  </div>
                )}
              </div>

              {/* Research accordion */}
              <ResearchPanel research={research} />

              {/* Email drafts */}
              {emails && (
                <div>
                  <SectionHeader
                    title={`Email Variants — ${goalLabel}`}
                    accent={T.accent}
                    action={
                      <CopyButton
                        text={emails.map(e => `--- ${e.angle} ---\nSubject: ${e.subject}\n\n${e.body}`).join("\n\n")}
                        label="Copy all"
                      />
                    }
                  />
                  {emails.map((email, i) => <EmailCard key={i} email={email} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${T.textMuted}; }
      `}</style>
    </div>
  );
}
