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

// ── Tone (#8) ─────────────────────────────────────────────────────────────────
const TONE_OPTS = [
  { value: "direct",   label: "Direct"   },
  { value: "balanced", label: "Balanced" },
  { value: "formal",   label: "Formal"   },
];
const TONE_PROMPTS = {
  direct:   "Write in a punchy, direct register — assume the reader is busy, cut every unnecessary word.",
  balanced: "Write in a confident, collegial register — peer-to-peer, practitioner to practitioner.",
  formal:   "Write in a professional, measured register — appropriate for enterprise and executive audiences.",
};

const LS_KEY_API     = "emailfold_apikey";
const LS_KEY_PRODUCT = "emailfold_product";
const LS_KEY_HISTORY = "emailfold_history";
const LS_KEY_SENDER  = "emailfold_sender";
const LS_KEY_INTEL   = "emailfold_intel_raw";
const LS_KEY_TONE    = "emailfold_tone"; // #8

// ── Intel Package Parser ──────────────────────────────────────────────────────
function parseIntel(text) {
  if (!text?.trim()) return null;
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

  const intel = { naicsCode: "", naicsLabel: "", summary: "", angles: [], signals: [], qualifying_criteria: [], red_flags: [], _source: "markdown" };
  const summaryM = text.match(/## Summary\n([\s\S]*?)(?=\n##)/);
  if (summaryM) intel.summary = summaryM[1].trim();
  const signalsM = text.match(/\*\*Signals:\*\*\n([\s\S]*?)(?=\n\*\*|\n##)/);
  if (signalsM) intel.signals = (signalsM[1].match(/- (.+)/g) || []).map(s => s.replace(/^- /, "").trim());
  const criteriaM = text.match(/\*\*Qualifying Criteria:\*\*\n([\s\S]*?)(?=\n\*\*|\n##)/);
  if (criteriaM) intel.qualifying_criteria = (criteriaM[1].match(/- (.+)/g) || []).map(s => s.replace(/^- /, "").trim());
  const anglesSection = text.match(/## Sales Angles\n([\s\S]*?)(?=\n## |$)/);
  if (anglesSection) {
    for (const block of anglesSection[1].split(/(?=### )/)) {
      const nameM = block.match(/### (.+)/);
      const hypoM = block.match(/\*\*Hypothesis:\*\* ([\s\S]*?)(?=\*\*Hook)/);
      const hookM = block.match(/\*\*Hook:\*\* (.+)/);
      if (nameM && hookM) intel.angles.push({ name: nameM[1].trim(), hypothesis: hypoM ? hypoM[1].trim() : "", hook: hookM[1].trim() });
    }
  }
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

// ── Email Card (#5 word count, #6 inline edit, #7 subject variants) ───────────
function EmailCard({ email, idx }) {
  const [expanded,       setExpanded]       = useState(true);
  const [editing,        setEditing]        = useState(false);         // #6
  const [editedBody,     setEditedBody]     = useState(email.body);    // #6
  const [editedSubject,  setEditedSubject]  = useState(email.subject); // #6
  const [activeSubjIdx,  setActiveSubjIdx]  = useState(0);             // #7

  const subjects    = email.subjects?.length > 1 ? email.subjects : null; // #7
  const activeSubj  = subjects ? subjects[activeSubjIdx] : editedSubject;
  const displaySubj = editing ? editedSubject : activeSubj;

  // #5 — word count
  const wordCount = editedBody.trim().split(/\s+/).filter(Boolean).length;
  const wcColor   = wordCount <= 120 ? T.green  : wordCount <= 140 ? T.amber  : T.red;
  const wcBg      = wordCount <= 120 ? T.greenBg: wordCount <= 140 ? T.amberBg: T.redBg;
  const wcBorder  = wordCount <= 120 ? T.greenBorder : wordCount <= 140 ? T.amberBorder : T.redBorder;

  const colors = [
    { color: T.violet, bg: T.violetBg, border: T.violetBorder },
    { color: T.amber,  bg: T.amberBg,  border: T.amberBorder  },
    { color: T.green,  bg: T.greenBg,  border: T.greenBorder  },
    { color: T.red,    bg: T.redBg,    border: T.redBorder    },
    { color: T.accent, bg: T.accentBg, border: T.accentBorder },
  ];
  const cfg      = colors[idx % colors.length];
  const fullText = `Subject: ${displaySubj}\n\n${editedBody}`;

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: T.radius, marginBottom: 12, boxShadow: T.shadow, overflow: "hidden",
    }}>
      {/* ── Card Header ── */}
      <div
        onClick={() => !editing && setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", cursor: editing ? "default" : "pointer",
          borderBottom: expanded ? `1px solid ${T.border}` : "none",
          background: expanded ? "#fcfcfd" : T.surface,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <span style={{
            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
            borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700,
            letterSpacing: "0.04em", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {email.angle}
          </span>
          {/* #6 — editable subject */}
          {editing ? (
            <input
              value={editedSubject}
              onChange={e => setEditedSubject(e.target.value)}
              onClick={e => e.stopPropagation()}
              style={{
                flex: 1, border: `1px solid ${T.borderFocus}`, borderRadius: T.radiusSm,
                padding: "3px 8px", fontSize: 13, fontWeight: 600, color: T.text,
                background: T.surface, outline: "none", fontFamily: "inherit",
              }}
            />
          ) : (
            <span style={{
              fontSize: 13, fontWeight: 600, color: T.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {displaySubj}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, marginLeft: 10 }}>
          {/* #5 — word count badge */}
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
            background: wcBg, color: wcColor, border: `1px solid ${wcBorder}`,
            whiteSpace: "nowrap",
          }}>{wordCount}w</span>
          {/* #6 — edit toggle */}
          <button
            onClick={e => { e.stopPropagation(); setEditing(v => !v); if (editing) setExpanded(true); }}
            style={{
              background: "none", border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
              padding: "3px 8px", fontSize: 11, color: editing ? T.accent : T.textMuted,
              cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
            }}
          >
            {editing ? "Done" : "Edit"}
          </button>
          <CopyButton text={fullText} label="Copy" />
          <span style={{
            fontSize: 14, color: T.textMuted, display: "inline-block",
            transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s",
          }}>▾</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "16px 18px" }}>
          {/* #7 — subject line picker chips */}
          {subjects && !editing && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
                Subject Variants
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {subjects.map((s, i) => (
                  <div
                    key={i}
                    onClick={() => setActiveSubjIdx(i)}
                    style={{
                      padding: "5px 10px", borderRadius: T.radiusSm, cursor: "pointer",
                      border: `1px solid ${i === activeSubjIdx ? T.accentBorder : T.border}`,
                      background: i === activeSubjIdx ? T.accentBg : T.bg,
                      fontSize: 12, color: i === activeSubjIdx ? T.accent : T.textSub,
                      fontWeight: i === activeSubjIdx ? 600 : 400,
                    }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {email.hook_used && (
            <div style={{
              fontSize: 11, color: T.textMuted, marginBottom: 10, fontStyle: "italic",
              padding: "5px 10px", background: T.bg, borderRadius: T.radiusSm,
              borderLeft: `2px solid ${cfg.border}`,
            }}>
              <strong style={{ color: T.textSub }}>ProspectFold hook:</strong> {email.hook_used}
            </div>
          )}

          {/* #6 — editable body */}
          {editing ? (
            <textarea
              value={editedBody}
              onChange={e => setEditedBody(e.target.value)}
              rows={10}
              style={{
                width: "100%", boxSizing: "border-box",
                border: `1px solid ${T.borderFocus}`, borderRadius: T.radiusSm,
                padding: "14px 16px", marginBottom: 10,
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: 14, lineHeight: 1.7, color: T.text,
                background: T.surface, outline: "none", resize: "vertical",
              }}
            />
          ) : (
            <div style={{
              background: T.bg, border: `1px solid ${T.border}`,
              borderRadius: T.radiusSm, padding: "14px 16px", marginBottom: 10,
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: 14, lineHeight: 1.7, color: T.text, whiteSpace: "pre-wrap",
            }}>
              {editedBody}
            </div>
          )}

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

// ── Research Panel (#11 signal match/miss) ────────────────────────────────────
function ResearchPanel({ research }) {
  const [open, setOpen] = useState(true);
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

          {/* #11 — signals confirmed */}
          {research.signals_confirmed?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Signals Confirmed</div>
              {research.signals_confirmed.map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: T.green, padding: "3px 0 3px 10px", borderLeft: `2px solid ${T.greenBorder}`, marginBottom: 3 }}>
                  ✓ {s}
                </div>
              ))}
            </div>
          )}

          {/* #11 — signals missing */}
          {research.signals_missing?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Signals Not Found</div>
              {research.signals_missing.map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: T.textMuted, padding: "3px 0 3px 10px", borderLeft: `2px solid ${T.border}`, marginBottom: 3 }}>
                  ✗ {s}
                </div>
              ))}
            </div>
          )}

          {/* fallback for old signals_found format */}
          {!research.signals_confirmed && research.signals_found?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Signals Found</div>
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
  const [intelRaw,      setIntelRaw]      = useState(() => localStorage.getItem(LS_KEY_INTEL)   || "");
  const [intelParsed,   setIntelParsed]   = useState(null);
  const [editingPitch,  setEditingPitch]  = useState(false);
  const [tone,          setTone]          = useState(() => localStorage.getItem(LS_KEY_TONE)    || "balanced"); // #8

  const [companyName,     setCompanyName]     = useState("");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [companyUrl,      setCompanyUrl]      = useState("");
  const [companyNotes,    setCompanyNotes]    = useState(""); // #12
  const [contactName,  setContactName]  = useState("");
  const [contactRole,  setContactRole]  = useState("");
  const [emailGoal,    setEmailGoal]    = useState("cold_intro");

  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [phase,         setPhase]         = useState("");
  const [research,      setResearch]      = useState(null);
  const [emails,        setEmails]        = useState(null);
  const [historySearch, setHistorySearch] = useState(""); // #15
  const [dragOver,      setDragOver]      = useState(false); // #10
  const [history,       setHistory]       = useState(() => {
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
  useEffect(() => { localStorage.setItem(LS_KEY_TONE,    tone);          }, [tone]); // #8

  // Auto-parse intel
  useEffect(() => {
    if (!intelRaw.trim()) { setIntelParsed(null); return; }
    setIntelParsed(parseIntel(intelRaw));
  }, [intelRaw]);

  const stop = () => { if (abortRef.current) abortRef.current.abort(); setLoading(false); setPhase(""); };

  // ── run (#1 overrides, #8 tone, #11 signals, #12 notes, #7 subjects) ─────────
  const run = useCallback(async (overrides = {}) => {
    const name = overrides.companyName ?? companyName;
    const url  = overrides.companyUrl  ?? companyUrl;

    if (!name.trim()) { setError("Enter a company name."); return; }
    if (!apiKey.trim()) { setError("Add your Anthropic API key first."); return; }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setResearch(null);
    setEmails(null);
    setPhase(`Scanning ${name}...`);

    // ── Phase 1: Company scan ─────────────────────────────────────────────────
    let researchData = null;
    try {
      // #11 — build signals check block from intel
      const signalsBlock = intelParsed?.signals?.length
        ? `\nICP SIGNALS TO CHECK (assess which apply to this company during your search):\n${intelParsed.signals.map(s => `- ${s}`).join("\n")}\n`
        : "";

      const researchPrompt = `You are a sales researcher. Search the web for "${name}"${url ? ` (${url})` : ""} and return a tight company snapshot.

Find only:
1. What they do in 1-2 sentences
2. Approximate headcount and stage (startup/growth/enterprise)
3. Any news from the last 90 days (funding, launches, exec hire, expansion) — skip if none
4. Their primary tech stack if visible in job posts or press
${signalsBlock}
Return JSON only:
{
  "company_overview": "1-2 sentence description",
  "size": "headcount estimate or unknown",
  "stage": "startup | growth | enterprise | public | unknown",
  "tech_stack": ["tech1"],
  "recent_news": [{ "headline": "string", "significance": "string", "date": "string" }],
  "signals_confirmed": ["ICP signals from the list that clearly apply"],
  "signals_missing": ["ICP signals from the list that don't apply or couldn't be verified"]
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
          model: "claude-haiku-3-5",
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: researchPrompt }],
        }),
      });

      if (r1.ok) {
        const d1 = await r1.json();
        const text = d1.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
        researchData = extractJSON(text);
        if (researchData) { setResearch(researchData); setPhase("Drafting emails..."); }
      }
    } catch (e) {
      if (e?.name === "AbortError") { setLoading(false); return; }
    }

    // ── Phase 2: Email Drafting ───────────────────────────────────────────────
    const goalLabel = EMAIL_GOALS.find(g => g.value === emailGoal)?.label || emailGoal;

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

    // #12 — company notes
    const notesBlock = companyNotes.trim()
      ? `\nWHAT WE KNOW:\n${companyNotes.trim()}\n`
      : "";

    const draftPrompt = `${intelContext}COMPANY RESEARCH:
${researchData ? JSON.stringify(researchData, null, 2) : `Company: ${name}${url ? `\nURL: ${url}` : ""}`}

RECIPIENT:${contactName ? `\nName: ${contactName}` : " Not specified"}${contactRole ? `\nRole: ${contactRole}` : ""}
${notesBlock}
OUR OFFERING:
${senderProduct}

EMAIL GOAL: ${goalLabel}
SENDER: ${senderName || "[Your Name]"} — Foxworks Studios

${anglesBlock}

EMAIL RULES (non-negotiable):
- Max 120 words per body
- First sentence must be specific to ${name} — no generic openers
- Banned: "I hope this finds you well", "I came across your company", "I wanted to reach out"
- One clear, low-friction CTA (15-minute call, a reply question, etc.)
- Peer-to-peer register — practitioner talking to practitioner
- If ProspectFold hooks are provided, USE them verbatim or as the core value prop sentence, then personalize around them

Return ONLY this JSON:
{
  "emails": [
    {
      "angle": "exact angle name from ProspectFold intel (or generic if no intel)",
      "subject": "primary subject line under 8 words",
      "subjects": ["subject variant 1", "subject variant 2", "subject variant 3"],
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
          model: "claude-sonnet-4-5",
          max_tokens: 2500,
          system: `You are a world-class B2B copywriter for Foxworks Studios, an AI engineering collective. ${TONE_PROMPTS[tone]} Never generic, never corporate.`, // #8
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
        id: Date.now(), companyName: name, companyUrl: url, contactName, contactRole,
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
  }, [apiKey, companyName, companyUrl, companyNotes, contactName, contactRole, emailGoal, senderProduct, senderName, intelParsed, tone]); // #8 tone added

  // #4 — ⌘+Enter keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !loading) run();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [run, loading]);

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

  // #14 — export CSV
  const exportCSV = () => {
    const headers = ["Company", "URL", "Contact", "Role", "Goal", "Angle", "Subject", "Body", "Date"];
    const rows = history.flatMap(e =>
      (e.emails || []).map(em => [
        e.companyName, e.companyUrl || "", e.contactName || "", e.contactRole || "",
        e.emailGoal, em.angle, em.subject, em.body.replace(/\n/g, " "),
        new Date(e.ts).toLocaleDateString(),
      ])
    );
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: "emailfold-export.csv",
    });
    a.click();
  };

  // Derived values (#2 position indicator, #3 next button, #15 history filter)
  const selectedIdx   = intelParsed?.apollo_companies?.findIndex(co => co.name === selectedCompany) ?? -1;
  const totalCos      = intelParsed?.apollo_companies?.length ?? 0;
  const nextCompany   = selectedIdx >= 0 && selectedIdx < totalCos - 1
    ? intelParsed.apollo_companies[selectedIdx + 1]
    : null;
  const filteredHist  = historySearch.trim()
    ? history.filter(e => e.companyName.toLowerCase().includes(historySearch.toLowerCase()))
    : history;

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
            <FieldLabel>ProspectFold Intel</FieldLabel>
            {intelParsed ? (
              <IntelBadge intel={intelParsed} onClear={() => { setIntelRaw(""); setIntelParsed(null); }} />
            ) : (
              <p style={{ fontSize: 11, color: T.textMuted, margin: 0, lineHeight: 1.6 }}>
                Paste intel in the main panel to load pre-crafted angles and buying signals.
              </p>
            )}
          </div>

          <Divider />

          {/* Target */}
          <FieldLabel>Target Company</FieldLabel>
          <SideInput label="Company Name *" value={companyName} onChange={setCompanyName} placeholder="Acme Corp" />
          <SideInput label="Website URL"    value={companyUrl}  onChange={setCompanyUrl}  placeholder="https://acmecorp.com" />

          {/* #12 — Company notes */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.textSub, marginBottom: 4 }}>Context (optional)</label>
            <textarea
              value={companyNotes}
              onChange={e => setCompanyNotes(e.target.value)}
              placeholder="Recent convo, mutual connection, specific pain point..."
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box",
                border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                padding: "7px 10px", fontSize: 11, color: T.text, lineHeight: 1.5,
                background: T.bg, outline: "none", fontFamily: "inherit", resize: "vertical",
              }}
            />
          </div>

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

          {/* #8 — Tone selector */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.textSub, marginBottom: 4 }}>Tone</label>
            <div style={{ display: "flex", gap: 4 }}>
              {TONE_OPTS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTone(opt.value)}
                  style={{
                    flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 600,
                    borderRadius: T.radiusSm, cursor: "pointer", fontFamily: "inherit",
                    border: `1px solid ${tone === opt.value ? T.accent : T.border}`,
                    background: tone === opt.value ? T.accentBg : T.surface,
                    color: tone === opt.value ? T.accent : T.textMuted,
                    transition: "all 0.12s",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <SideInput label="Your Name" value={senderName} onChange={setSenderName} placeholder="Josh Tseppich" />

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.textSub }}>Offering</label>
              <button
                onClick={() => setEditingPitch(e => !e)}
                style={{
                  background: "none", border: "none", fontSize: 11,
                  color: editingPitch ? T.red : T.textMuted,
                  cursor: "pointer", fontFamily: "inherit", padding: 0,
                }}
              >
                {editingPitch ? "Lock" : "Edit"}
              </button>
            </div>
            {editingPitch ? (
              <textarea value={senderProduct} onChange={e => setSenderProduct(e.target.value)} rows={5} style={{
                width: "100%", boxSizing: "border-box",
                border: `1px solid ${T.borderFocus}`, borderRadius: T.radiusSm,
                padding: "7px 10px", fontSize: 11, color: T.text, lineHeight: 1.5,
                background: T.surface, outline: "none", fontFamily: "inherit", resize: "vertical",
              }} />
            ) : (
              <div style={{
                fontSize: 11, color: T.textMuted, lineHeight: 1.55,
                background: T.bg, borderRadius: T.radiusSm,
                padding: "7px 10px", border: `1px solid ${T.border}`,
                maxHeight: 80, overflow: "hidden",
                maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
              }}>
                {senderProduct}
              </div>
            )}
          </div>

          {/* #4 — Generate button with ⌘↵ hint */}
          <button onClick={loading ? stop : run} title="⌘↵" style={{
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

          {/* #13 — Error with retry button */}
          {error && (
            <div style={{
              marginTop: 10, padding: "8px 12px",
              background: T.redBg, border: `1px solid ${T.redBorder}`,
              borderRadius: T.radiusSm,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            }}>
              <span style={{ fontSize: 12, color: T.red, flex: 1 }}>{error}</span>
              <button
                onClick={() => run()}
                style={{
                  background: "none", border: `1px solid ${T.redBorder}`,
                  borderRadius: T.radiusSm, padding: "2px 8px",
                  fontSize: 11, fontWeight: 700, color: T.red,
                  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* #14 + #15 — History with search + export */}
          {history.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <FieldLabel>History</FieldLabel>
                <button
                  onClick={exportCSV}
                  style={{
                    background: "none", border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                    padding: "2px 8px", fontSize: 10, fontWeight: 700, color: T.textMuted,
                    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Export CSV
                </button>
              </div>
              {history.length > 3 && (
                <input
                  placeholder="Search..."
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                    padding: "5px 10px", fontSize: 11, color: T.text,
                    background: T.bg, outline: "none", fontFamily: "inherit", marginBottom: 6,
                  }}
                />
              )}
              {filteredHist.map(entry => (
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
              {historySearch && filteredHist.length === 0 && (
                <div style={{ fontSize: 11, color: T.textMuted, padding: "6px 0" }}>No matches for "{historySearch}"</div>
              )}
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

          {/* Company picker — persists above results (#1 auto-gen, #2 position) */}
          {!loading && intelParsed?.apollo_companies?.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: T.amber,
                  textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ display: "inline-block", width: 3, height: 14, background: T.amber, borderRadius: 2 }} />
                  Apollo Queue
                </div>
                {/* #2 — position indicator */}
                <span style={{ fontSize: 11, color: T.textMuted }}>
                  {selectedIdx >= 0
                    ? `${selectedIdx + 1} / ${totalCos}`
                    : `${totalCos} companies — click to generate`}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {intelParsed.apollo_companies.map((co, i) => {
                  const isActive = selectedCompany === co.name;
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        setCompanyName(co.name || "");
                        setCompanyUrl(co.website_url || "");
                        setSelectedCompany(co.name || "");
                        setCompanyNotes(""); // #12 clear per company
                        setEmails(null); setResearch(null); setError(null);
                        run({ companyName: co.name || "", companyUrl: co.website_url || "" }); // #1 auto-gen
                      }}
                      style={{
                        background: isActive ? T.amberBg : T.surface,
                        border: `1px solid ${isActive ? T.amber : T.border}`,
                        borderRadius: T.radiusSm, padding: "10px 12px",
                        cursor: "pointer", transition: "border-color 0.15s, background 0.1s",
                      }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = T.amber; e.currentTarget.style.background = T.amberBg; } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface; } }}
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
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state — intel drop zone (#9 clipboard, #10 drag-drop) */}
          {!loading && !research && !emails && !intelParsed?.apollo_companies?.length && !intelParsed && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", minHeight: 420, textAlign: "center",
            }}>
              <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.25 }}>✉</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.textSub, marginBottom: 6, letterSpacing: "-0.02em" }}>
                Start with a ProspectFold intel package
              </div>
              <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 24, maxWidth: 380, lineHeight: 1.6 }}>
                Paste the JSON from the{" "}
                <span style={{ color: T.violet, fontWeight: 600 }}>✉ → EmailFold</span>
                {" "}button, or drop a <code style={{ background: T.bg, padding: "1px 4px", borderRadius: 3 }}>.md</code> file.
              </div>
              <div style={{ width: "100%", maxWidth: 560 }}>
                {/* #10 — drag-drop wrapper */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = ev => setIntelRaw(ev.target.result);
                    reader.readAsText(file);
                  }}
                >
                  <textarea
                    value={intelRaw}
                    onChange={e => setIntelRaw(e.target.value)}
                    placeholder={"Paste ProspectFold intel here — JSON from the ✉ → EmailFold button, or Markdown report..."}
                    rows={8}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      border: `2px dashed ${dragOver ? T.violet : T.violetBorder}`,
                      borderRadius: T.radius,
                      padding: "16px 18px", fontSize: 12, color: T.text, lineHeight: 1.6,
                      background: dragOver ? "#EDE9FE" : T.violetBg,
                      outline: "none", fontFamily: "inherit", resize: "vertical",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    onFocus={e => e.target.style.borderColor = T.violet}
                    onBlur={e => e.target.style.borderColor = T.violetBorder}
                  />
                </div>
                {intelRaw.trim() && !intelParsed && (
                  <div style={{
                    marginTop: 8, fontSize: 12, color: T.red,
                    padding: "6px 12px", background: T.redBg, borderRadius: T.radiusSm,
                    border: `1px solid ${T.redBorder}`, textAlign: "left",
                  }}>
                    Couldn't parse — paste the JSON from the → EmailFold button or the Markdown report
                  </div>
                )}
                {/* #9 — paste from clipboard */}
                <button
                  onClick={async () => {
                    try { setIntelRaw(await navigator.clipboard.readText()); } catch {}
                  }}
                  style={{
                    marginTop: 10, background: T.violetBg, border: `1px solid ${T.violetBorder}`,
                    borderRadius: T.radiusSm, padding: "6px 14px", fontSize: 11, fontWeight: 600,
                    color: T.violet, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  ⌘V Paste from Clipboard
                </button>
                <p style={{ fontSize: 11, color: T.textMuted, marginTop: 10 }}>
                  No intel? Enter a company name in the sidebar and generate with generic angles.
                </p>
              </div>
            </div>
          )}

          {/* Empty state — intel loaded, no results yet */}
          {!loading && !research && !emails && !intelParsed?.apollo_companies?.length && intelParsed && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", minHeight: 420, textAlign: "center", color: T.textMuted,
            }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>✉</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.textSub, marginBottom: 8 }}>
                {intelParsed.angles.length} angles loaded from ProspectFold
              </div>
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
            </div>
          )}

          {/* Results */}
          {hasResults && (
            <>
              <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
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

                {/* #3 — Next → button */}
                {nextCompany && emails && (
                  <button
                    onClick={() => {
                      setCompanyName(nextCompany.name || "");
                      setCompanyUrl(nextCompany.website_url || "");
                      setSelectedCompany(nextCompany.name || "");
                      setCompanyNotes("");
                      setEmails(null); setResearch(null); setError(null);
                      run({ companyName: nextCompany.name || "", companyUrl: nextCompany.website_url || "" });
                    }}
                    style={{
                      background: T.accentBg, border: `1px solid ${T.accentBorder}`,
                      borderRadius: T.radiusSm, padding: "8px 14px",
                      fontSize: 12, fontWeight: 700, color: T.accent,
                      cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", gap: 6,
                      whiteSpace: "nowrap", flexShrink: 0, marginLeft: 16,
                    }}
                  >
                    Next: {nextCompany.name} →
                  </button>
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
