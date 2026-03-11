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
  shadow:       "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  shadowMd:     "0 4px 6px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)",
  radius:       8,
  radiusSm:     6,
};

const FOXWORKS_PITCH = `Foxworks Studios builds MCP servers, custom AI agents, and developer tooling — scoped and shipped in days, not months. We connect frontier models to internal tools, databases, and APIs your team already uses. Typical builds: custom MCP servers that give AI structured access to internal systems, AI agents that live inside Slack or your existing stack, workflow automations that turn repetitive ops into autonomous pipelines, and CLIs for engineering teams. Value-priced against the outcome it creates, not hours. Most projects deploy within a week of scoping.`;

const EMAIL_GOALS = [
  { value: "cold_intro",   label: "Cold Introduction" },
  { value: "follow_up",    label: "Follow-Up" },
  { value: "partnership",  label: "Partnership Inquiry" },
  { value: "demo_request", label: "Request a Demo" },
];

const LS_KEY_API     = "emailfold_apikey";
const LS_KEY_PRODUCT = "emailfold_product";
const LS_KEY_HISTORY = "emailfold_history";
const LS_KEY_SENDER  = "emailfold_sender";
const LS_KEY_INTEL   = "emailfold_intel_raw";

// ── Intel Package Parser ──────────────────────────────────────────────────────
// Handles both the JSON bridge format (from → EmailFold button) and raw Markdown paste.
function parseIntel(text) {
  if (!text?.trim()) return null;

  // Try JSON bridge format first
  try {
    const json = JSON.parse(text.trim());
    if (json.__emailfold) {
      return {
        naicsCode:            json.naicsCode || "",
        naicsLabel:           json.naicsLabel || "",
        summary:              json.summary || "",
        angles:               json.angles || [],
        signals:              json.signals || [],
        qualifying_criteria:  json.qualifying_criteria || [],
        red_flags:            json.red_flags || [],
        apollo_companies:     json.apollo_companies || [],
        _source:              "json",
      };
    }
  } catch {}

  // Parse Markdown format (ProspectFold "Copy Markdown" output)
  const intel = { naicsCode: "", naicsLabel: "", summary: "", angles: [], signals: [], qualifying_criteria: [], red_flags: [], _source: "markdown" };

  // Summary
  const summaryM = text.match(/## Summary\n([\s\S]*?)(?=\n##)/);
  if (summaryM) intel.summary = summaryM[1].trim();

  // ICP signals
  const signalsM = text.match(/\*\*Signals:\*\*\n([\s\S]*?)(?=\n\*\*|\n##)/);
  if (signalsM) intel.signals = (signalsM[1].match(/- (.+)/g) || []).map(s => s.replace(/^- /, "").trim());

  // Qualifying criteria
  const criteriaM = text.match(/\*\*Qualifying Criteria:\*\*\n([\s\S]*?)(?=\n\*\*|\n##)/);
  if (criteriaM) intel.qualifying_criteria = (criteriaM[1].match(/- (.+)/g) || []).map(s => s.replace(/^- /, "").trim());

  // Sales angles
  const anglesSection = text.match(/## Sales Angles\n([\s\S]*?)(?=\n## |$)/);
  if (anglesSection) {
    const blocks = anglesSection[1].split(/(?=### )/);
    for (const block of blocks) {
      const nameM       = block.match(/### (.+)/);
      const hypoM       = block.match(/\*\*Hypothesis:\*\* ([\s\S]*?)(?=\*\*Hook)/);
      const hookM       = block.match(/\*\*Hook:\*\* (.+)/);
      if (nameM && hookM) {
        intel.angles.push({
          name:       nameM[1].trim(),
          hypothesis: hypoM ? hypoM[1].trim() : "",
          hook:       hookM[1].trim(),
        });
      }
    }
  }

  // Red flags
  const redM = text.match(/## Red Flags\n([\s\S]*?)(?=\n##|$)/);
  if (redM) intel.red_flags = (redM[1].match(/- (.+)/g) || []).map(s => s.replace(/^- /, "").trim());

  return intel.angles.length > 0 ? intel : null;
}

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
        borderRadius: T.radiusSm, padding: "4px 12px",
        fontSize: 12, fontWeight: 600, cursor: "pointer",
        fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap",
      }}
    >
      {copied ? successLabel : label}
    </button>
  );
}

function Divider() {
  return <hr style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "14px 0" }} />;
}

function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: T.textMuted,
      letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8,
    }}>{children}</div>
  );
}

function SideInput({ label, value, onChange, placeholder, type = "text" }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.textSub, marginBottom: 4 }}>{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
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

// ── Intel Badge ───────────────────────────────────────────────────────────────
function IntelBadge({ intel, onClear }) {
  if (!intel) return null;
  return (
    <div style={{
      background: T.violetBg, border: `1px solid ${T.violetBorder}`,
      borderRadius: T.radiusSm, padding: "8px 10px",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.violet }}>
          ✓ {intel.angles.length} angles loaded
        </div>
        {intel.naicsLabel && (
          <div style={{ fontSize: 11, color: T.violet, opacity: 0.7, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {intel.naicsLabel}
          </div>
        )}
      </div>
      <button onClick={onClear} style={{
        background: "none", border: "none", color: T.violet, cursor: "pointer",
        fontSize: 14, padding: "0 2px", opacity: 0.6, flexShrink: 0,
      }}>✕</button>
    </div>
  );
}

// ── Email Card ────────────────────────────────────────────────────────────────
function EmailCard({ email, idx }) {
  const [expanded, setExpanded] = useState(true);
  const colors = [
    { color: T.violet, bg: T.violetBg, border: T.violetBorder },
    { color: T.amber,  bg: T.amberBg,  border: T.amberBorder  },
    { color: T.green,  bg: T.greenBg,  border: T.greenBorder  },
    { color: T.red,    bg: T.redBg,    border: T.redBorder    },
    { color: T.accent, bg: T.accentBg, border: T.accentBorder },
  ];
  const cfg = colors[idx % colors.length];
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
            letterSpacing: "0.04em", whiteSpace: "nowrap", flexShrink: 0,
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
            fontSize: 14, color: T.textMuted, display: "inline-block",
            transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s",
          }}>▾</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "16px 18px" }}>
          {email.hook_used && (
            <div style={{
              fontSize: 11, color: T.textMuted, marginBottom: 10, fontStyle: "italic",
              padding: "5px 10px", background: T.bg, borderRadius: T.radiusSm,
              borderLeft: `2px solid ${cfg.border}`,
            }}>
              <strong style={{ color: T.textSub }}>ProspectFold hook:</strong> {email.hook_used}
            </div>
          )}
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
      <button onClick={() => setOpen(o => !o)} style={{
        background: "none", border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
        padding: "6px 12px", fontSize: 12, color: T.textSub, cursor: "pointer",
        fontFamily: "inherit", fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
        marginBottom: open ? 10 : 0,
      }}>
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
        Company Intelligence
      </button>
      {open && (
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: T.radius, padding: "16px 18px", boxShadow: T.shadow,
        }}>
          {research.company_overview && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Overview</div>
              <p style={{ margin: 0, fontSize: 13, color: T.text, lineHeight: 1.6 }}>{research.company_overview}</p>
            </div>
          )}
          {research.signals_found?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Signals Confirmed</div>
              {research.signals_found.map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: T.text, padding: "3px 0 3px 10px", borderLeft: `2px solid ${T.greenBorder}`, marginBottom: 3 }}>{s}</div>
              ))}
            </div>
          )}
          {research.recent_news?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Recent News</div>
              {research.recent_news.map((n, i) => (
                <div key={i} style={{ padding: "7px 10px", background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: T.radiusSm, marginBottom: 5 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{n.headline}</div>
                  {n.significance && <div style={{ fontSize: 12, color: T.textSub, marginTop: 1 }}>{n.significance}</div>}
                  {n.date && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{n.date}</div>}
                </div>
              ))}
            </div>
          )}
          {research.tech_stack?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Tech Stack</div>
              <div>{research.tech_stack.map((t, i) => (
                <span key={i} style={{
                  background: T.greenBg, color: T.green, border: `1px solid ${T.greenBorder}`,
                  borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 500,
                  display: "inline-block", margin: "2px 3px 2px 0",
                }}>{t}</span>
              ))}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [apiKey,        setApiKey]        = useState(() => localStorage.getItem(LS_KEY_API)     || "");
  const [senderName,    setSenderName]    = useState(() => localStorage.getItem(LS_KEY_SENDER)  || "");
  const [senderProduct, setSenderProduct] = useState(() => localStorage.getItem(LS_KEY_PRODUCT) || FOXWORKS_PITCH);
  const [intelRaw,       setIntelRaw]       = useState(() => localStorage.getItem(LS_KEY_INTEL) || "");
  const [intelParsed,    setIntelParsed]    = useState(null);
  const [showIntelPaste, setShowIntelPaste] = useState(false);
  const [skipResearch,   setSkipResearch]   = useState(true);   // default: skip web research (saves cost)

  const [companyName,  setCompanyName]  = useState("");
  const [companyUrl,   setCompanyUrl]   = useState("");
  const [contactName,  setContactName]  = useState("");
  const [contactRole,  setContactRole]  = useState("");
  const [emailGoal,    setEmailGoal]    = useState("cold_intro");

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

  // Persist
  useEffect(() => { localStorage.setItem(LS_KEY_API,     apiKey);        }, [apiKey]);
  useEffect(() => { localStorage.setItem(LS_KEY_PRODUCT, senderProduct); }, [senderProduct]);
  useEffect(() => { localStorage.setItem(LS_KEY_SENDER,  senderName);    }, [senderName]);
  useEffect(() => { localStorage.setItem(LS_KEY_INTEL,   intelRaw);      }, [intelRaw]);
  useEffect(() => { localStorage.setItem(LS_KEY_HISTORY, JSON.stringify(history)); }, [history]);

  // Auto-parse intel whenever raw text changes
  useEffect(() => {
    if (!intelRaw.trim()) { setIntelParsed(null); return; }
    const parsed = parseIntel(intelRaw);
    setIntelParsed(parsed);
  }, [intelRaw]);

  const stop = () => { if (abortRef.current) abortRef.current.abort(); setLoading(false); setPhase(""); };

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
    // Skip research if intel loaded + skipResearch toggled (saves API cost significantly)
    const doResearch = !skipResearch || !intelParsed;
    setPhase(doResearch ? `Researching ${companyName}...` : "Drafting emails from ProspectFold angles...");

    // ── Phase 1: Company Research (optional) ──────────────────────────────────
    // Skipped by default when intel is loaded — intel already provides all the context needed.
    // Enable manually for company-specific personalization (costs ~$0.01–0.05 extra).
    let researchData = null;
    if (doResearch) {
      try {
        const signalsContext = intelParsed?.signals?.length
          ? `\nSearch for evidence that this company matches any of these buying signals:\n${intelParsed.signals.map(s => `- ${s}`).join("\n")}`
          : "";

        const researchPrompt = `You are a B2B sales intelligence researcher.

TARGET COMPANY: ${companyName}${companyUrl ? `\nWEBSITE: ${companyUrl}` : ""}
${signalsContext}

Use web search to find:
1. Company overview (what they do, market position, size, funding stage)
2. Tech stack from job postings, engineering blog, GitHub, or press
3. Recent news last 6 months (funding, launches, exec changes, expansions)
4. Observable pain points from press, reviews, or case studies
${intelParsed?.signals?.length ? "5. Evidence confirming any of the buying signals listed above" : ""}

Return this JSON:
{
  "company_overview": "2-3 sentence description",
  "size": "headcount estimate",
  "stage": "startup | growth | enterprise | public | unknown",
  "tech_stack": ["tech1", "tech2"],
  "recent_news": [{ "headline": string, "significance": string, "date": string }],
  "pain_points": ["specific pain point from public evidence"],
  "signals_found": ["confirmed buying signals this company shows"]
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
            model: "claude-haiku-3-5-20241022",
            max_tokens: 2000,
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
            setPhase("Research done — drafting emails...");
          }
        }
      } catch (e) {
        if (e?.name === "AbortError") { setLoading(false); return; }
        setPhase("Research unavailable — drafting from intel package...");
        await new Promise(r => setTimeout(r, 400));
      }
    }

    // ── Phase 2: Email Drafting ───────────────────────────────────────────────
    const goalLabel = EMAIL_GOALS.find(g => g.value === emailGoal)?.label || emailGoal;

    // Build the angles block — from ProspectFold intel if loaded, otherwise generic
    const anglesBlock = intelParsed?.angles?.length
      ? `SALES ANGLES (from ProspectFold intel — use these as the foundation for each email):
${intelParsed.angles.map((a, i) => `
ANGLE ${i + 1} — "${a.name}"
Hook: ${a.hook}
Hypothesis: ${a.hypothesis}`).join("\n")}

Select the 3 angles most relevant to this specific company based on the research above. Write one email per selected angle.`
      : `Write 3 emails using these angles:
1. Pain Point Hook — lead with an observable pain point
2. Recent News Hook — reference something specific that just happened
3. Tech Stack Hook — open with a tech-specific observation`;

    const intelContext = intelParsed
      ? `\nINDUSTRY CONTEXT (ProspectFold intel — ${intelParsed.naicsLabel || "target vertical"}):
Summary: ${intelParsed.summary}
Red flags to avoid: ${intelParsed.red_flags?.slice(0, 3).join("; ") || "none"}\n`
      : "";

    const draftPrompt = `You are a world-class B2B copywriter for Foxworks Studios, an AI engineering collective.
${intelContext}
COMPANY RESEARCH:
${researchData ? JSON.stringify(researchData, null, 2) : `Company: ${companyName}${companyUrl ? `\nURL: ${companyUrl}` : ""}`}

RECIPIENT:${contactName ? `\nName: ${contactName}` : " Not specified"}${contactRole ? `\nRole: ${contactRole}` : ""}

OUR OFFERING:
${senderProduct}

EMAIL GOAL: ${goalLabel}
SENDER: ${senderName || "[Your Name]"} — Foxworks Studios

${anglesBlock}

EMAIL RULES (non-negotiable):
- Max 120 words per body
- First sentence must be specific to ${companyName} — no generic openers
- Banned: "I hope this finds you well", "I came across your company", "I wanted to reach out"
- One clear, low-friction CTA (15-minute call, a reply question, etc.)
- Peer-to-peer register — practitioner talking to practitioner
- If ProspectFold hooks are provided, USE them verbatim or as the core value prop sentence, then personalize around them

Return ONLY this JSON:
{
  "emails": [
    {
      "angle": "exact angle name from ProspectFold intel (or generic if no intel)",
      "subject": "subject line under 8 words",
      "body": "full email body",
      "hook_used": "the ProspectFold hook this email is built around (or null)",
      "why": "one sentence: why this angle fits this specific company"
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
          model: "claude-haiku-3-5-20241022",
          max_tokens: 2500,
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
        id: Date.now(), companyName, companyUrl, contactName, contactRole,
        emailGoal, research: researchData, emails: parsed.emails,
        intelLabel: intelParsed?.naicsLabel || null, ts: Date.now(),
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
  }, [apiKey, companyName, companyUrl, contactName, contactRole, emailGoal, senderProduct, senderName, intelParsed]);

  const loadHistoryEntry = (entry) => {
    setCompanyName(entry.companyName || "");
    setCompanyUrl(entry.companyUrl   || "");
    setContactName(entry.contactName || "");
    setContactRole(entry.contactRole || "");
    setEmailGoal(entry.emailGoal     || "cold_intro");
    setResearch(entry.research || null);
    setEmails(entry.emails     || null);
    setError(null); setPhase("");
  };

  const goalLabel  = EMAIL_GOALS.find(g => g.value === emailGoal)?.label || emailGoal;
  const hasResults = !loading && (research || emails);

  return (
    <div style={{
      height: "100vh", background: T.bg,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* macOS title bar */}
      <div style={{
        WebkitAppRegion: "drag", height: 38, flexShrink: 0,
        background: T.surface, borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", paddingLeft: 80,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.textSub, letterSpacing: "-0.01em" }}>
          <span style={{ color: T.accent }}>Email</span>Fold
          {intelParsed?.naicsLabel && (
            <span style={{ fontSize: 11, color: T.violet, fontWeight: 500, marginLeft: 8 }}>
              · {intelParsed.naicsLabel}
            </span>
          )}
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── LEFT SIDEBAR ───────────────────────────────────────────────────── */}
        <div style={{
          width: 300, flexShrink: 0, borderRight: `1px solid ${T.border}`,
          background: T.surface, overflowY: "auto", padding: "18px 18px",
        }}>

          {/* API Key */}
          <div style={{ marginBottom: 4 }}>
            <FieldLabel>Anthropic API Key</FieldLabel>
            <input
              type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
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

          {/* Intel Package */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <FieldLabel>ProspectFold Intel</FieldLabel>
              {!intelParsed && (
                <button
                  onClick={() => setShowIntelPaste(p => !p)}
                  style={{
                    background: "none", border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                    padding: "2px 8px", fontSize: 11, color: T.textSub,
                    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                  }}
                >
                  {showIntelPaste ? "Hide" : "+ Paste"}
                </button>
              )}
            </div>

            {intelParsed ? (
              <IntelBadge intel={intelParsed} onClear={() => { setIntelRaw(""); setIntelParsed(null); }} />
            ) : showIntelPaste ? (
              <div>
                <textarea
                  value={intelRaw}
                  onChange={e => setIntelRaw(e.target.value)}
                  placeholder={'Paste the output from ProspectFold\'s "✉ → EmailFold" button, or paste the Markdown intel package...'}
                  rows={6}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                    padding: "8px 10px", fontSize: 11, color: T.text, lineHeight: 1.5,
                    background: T.bg, outline: "none", fontFamily: "inherit", resize: "vertical",
                  }}
                />
                {intelRaw.trim() && !intelParsed && (
                  <div style={{
                    marginTop: 4, fontSize: 11, color: T.red,
                    padding: "4px 8px", background: T.redBg, borderRadius: T.radiusSm,
                  }}>
                    Couldn't parse — paste the JSON from → EmailFold button or the Markdown report
                  </div>
                )}
                <p style={{ fontSize: 10, color: T.textMuted, marginTop: 5, marginBottom: 0, lineHeight: 1.5 }}>
                  In ProspectFold → generate intel → click <strong>✉ → EmailFold</strong>
                </p>
              </div>
            ) : (
              <p style={{ fontSize: 11, color: T.textMuted, margin: 0, lineHeight: 1.5 }}>
                Load a ProspectFold intel package to use pre-crafted angles and buying signals.
                Emails are more targeted when intel is loaded.
              </p>
            )}
          </div>

          <Divider />

          {/* Target */}
          <FieldLabel>Target Company</FieldLabel>
          <SideInput label="Company Name *" value={companyName} onChange={setCompanyName} placeholder="Acme Corp" />
          <SideInput label="Website URL"    value={companyUrl}  onChange={setCompanyUrl}  placeholder="https://acmecorp.com" />

          <Divider />

          <FieldLabel>Contact (optional)</FieldLabel>
          <SideInput label="Name" value={contactName} onChange={setContactName} placeholder="Jane Smith" />
          <SideInput label="Role" value={contactRole} onChange={setContactRole} placeholder="Owner / CEO" />

          <Divider />

          <FieldLabel>Email Config</FieldLabel>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.textSub, marginBottom: 4 }}>Goal</label>
            <select value={emailGoal} onChange={e => setEmailGoal(e.target.value)} style={{
              width: "100%", boxSizing: "border-box",
              border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
              padding: "7px 10px", fontSize: 12, color: T.text,
              background: T.surface, outline: "none", fontFamily: "inherit",
            }}>
              {EMAIL_GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>

          {/* Research toggle */}
          <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              id="skipResearch"
              checked={skipResearch}
              onChange={e => setSkipResearch(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            <label htmlFor="skipResearch" style={{ fontSize: 11, color: T.textSub, cursor: "pointer", lineHeight: 1.4 }}>
              Skip web research {intelParsed ? <span style={{ color: T.green }}>(recommended — intel loaded)</span> : <span style={{ color: T.amber }}>(faster, costs less)</span>}
            </label>
          </div>

          <SideInput label="Your Name" value={senderName} onChange={setSenderName} placeholder="Josh Tseppich" />

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.textSub, marginBottom: 4 }}>Your Offering</label>
            <textarea value={senderProduct} onChange={e => setSenderProduct(e.target.value)} rows={5} style={{
              width: "100%", boxSizing: "border-box",
              border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
              padding: "7px 10px", fontSize: 11, color: T.text, lineHeight: 1.5,
              background: T.surface, outline: "none", fontFamily: "inherit", resize: "vertical",
            }} />
          </div>

          <button onClick={loading ? stop : run} style={{
            background: loading ? T.redBg : T.accent,
            color: loading ? T.red : "#fff",
            border: loading ? `1px solid ${T.redBorder}` : "none",
            borderRadius: T.radiusSm, padding: "10px 0",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            fontFamily: "inherit", letterSpacing: "0.02em", transition: "background 0.15s",
            width: "100%",
          }}>
            {loading ? "Stop" : "Generate Emails"}
          </button>

          {error && (
            <div style={{
              marginTop: 10, padding: "8px 12px",
              background: T.redBg, border: `1px solid ${T.redBorder}`,
              borderRadius: T.radiusSm, fontSize: 12, color: T.red,
            }}>{error}</div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <FieldLabel>History</FieldLabel>
              {history.map(entry => (
                <div
                  key={entry.id} onClick={() => loadHistoryEntry(entry)}
                  style={{
                    padding: "7px 10px", borderRadius: T.radiusSm, cursor: "pointer",
                    marginBottom: 4, border: `1px solid ${T.border}`, background: T.bg,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = T.accentBg}
                  onMouseLeave={e => e.currentTarget.style.background = T.bg}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{entry.companyName}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>
                    {timeAgo(entry.ts)}{entry.intelLabel ? ` · ${entry.intelLabel}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── MAIN PANEL ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>

          {loading && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              background: T.accentBg, border: `1px solid ${T.accentBorder}`,
              borderRadius: T.radius, padding: "14px 18px", marginBottom: 24,
            }}>
              <div style={{
                width: 16, height: 16, border: `2px solid ${T.accent}`,
                borderTopColor: "transparent", borderRadius: "50%",
                animation: "spin 0.7s linear infinite", flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>{phase || "Working..."}</span>
            </div>
          )}

          {/* Company picker — shown when Apollo companies are imported from ProspectFold */}
          {!loading && !emails && intelParsed?.apollo_companies?.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: T.amber,
                  textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ display: "inline-block", width: 3, height: 14, background: T.amber, borderRadius: 2 }} />
                  Apollo Company Queue — {intelParsed.apollo_companies.length} companies
                </div>
                <span style={{ fontSize: 11, color: T.textMuted }}>Click to auto-fill target</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {intelParsed.apollo_companies.map((co, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      setCompanyName(co.name || "");
                      setCompanyUrl(co.website_url || "");
                      setEmails(null);
                      setResearch(null);
                      setError(null);
                    }}
                    style={{
                      background: T.surface, border: `1px solid ${T.border}`,
                      borderRadius: T.radiusSm, padding: "10px 12px",
                      cursor: "pointer", transition: "border-color 0.15s, background 0.1s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.amber; e.currentTarget.style.background = T.amberBg; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface; }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {co.name}
                    </div>
                    {co.website_url && (
                      <div style={{ fontSize: 11, color: T.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {co.website_url.replace(/^https?:\/\//, "")}
                      </div>
                    )}
                    {(co.industry || co.num_employees) && (
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 3 }}>
                        {[co.industry, co.num_employees ? `${co.num_employees} emp.` : null].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !research && !emails && !(intelParsed?.apollo_companies?.length) && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", minHeight: 420, textAlign: "center", color: T.textMuted,
            }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>✉</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.textSub, marginBottom: 8 }}>
                {intelParsed
                  ? `${intelParsed.angles.length} angles loaded from ProspectFold`
                  : "Research-backed email drafts"}
              </div>
              {intelParsed ? (
                <div style={{ maxWidth: 380 }}>
                  <div style={{ fontSize: 13, color: T.textSub, marginBottom: 12 }}>
                    {intelParsed.naicsLabel && <strong>{intelParsed.naicsLabel} · </strong>}
                    Enter a company name and generate — emails will be built from your ProspectFold angles.
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                    {intelParsed.angles.map((a, i) => (
                      <span key={i} style={{
                        background: T.violetBg, color: T.violet, border: `1px solid ${T.violetBorder}`,
                        borderRadius: 4, padding: "3px 9px", fontSize: 11, fontWeight: 600,
                      }}>{a.name}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 340 }}>
                  Load a ProspectFold intel package to use pre-crafted angles, or enter a company name and generate with generic angles.
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {hasResults && (
            <>
              <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.02em" }}>
                  {companyName}
                </h1>
                {companyUrl && (
                  <a href={companyUrl} onClick={e => { e.preventDefault(); const f = window.electronAPI?.openExternal; if (f) f(companyUrl); else window.open(companyUrl, "_blank"); }}
                    style={{ fontSize: 12, color: T.accent, textDecoration: "none" }}>
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
                {intelParsed?.naicsLabel && (
                  <div style={{ marginTop: 4 }}>
                    <span style={{
                      background: T.violetBg, color: T.violet, border: `1px solid ${T.violetBorder}`,
                      borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600,
                    }}>
                      Intel: {intelParsed.naicsLabel}
                    </span>
                  </div>
                )}
              </div>

              <ResearchPanel research={research} />

              {emails && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: T.accent,
                      textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{ display: "inline-block", width: 3, height: 14, background: T.accent, borderRadius: 2 }} />
                      Email Variants — {goalLabel}
                    </div>
                    <CopyButton
                      text={emails.map(e => `--- ${e.angle} ---\nSubject: ${e.subject}\n\n${e.body}`).join("\n\n")}
                      label="Copy all"
                    />
                  </div>
                  {emails.map((email, i) => <EmailCard key={i} email={email} idx={i} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${T.textMuted}; }
      `}</style>
    </div>
  );
}
