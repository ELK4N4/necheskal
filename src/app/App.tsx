import { useEffect, useState } from "react";
import propertiesJson from "../data/properties.json";
import { PropertyListSchema, type Property, FIELD_LABELS } from "../domain/property.schema";
import type { AnalysisReport, AnalysisStage } from "../services/analysisPipeline";
import { runAnalysis } from "../services/analysisPipeline";
import { createOpenAIClient, getUserFacingApiError } from "../services/openaiClient";
import type { DatabaseComparison } from "../domain/compareProposalToDatabase";
import type { RequirementComparison } from "../domain/evaluateProposalAgainstRequirements";

const parsedProperties = PropertyListSchema.safeParse(propertiesJson);
const propertyData: Property[] = parsedProperties.success ? parsedProperties.data : [];

type Page = "review" | "catalog";
const stages: Array<{ id: AnalysisStage; label: string }> = [
  { id: "screening", label: "בדיקת ההצעה" },
  { id: "lookup", label: "איתור נכס" },
  { id: "extraction", label: "חילוץ פרטים" },
  { id: "comparison", label: "השוואות" },
  { id: "recommendation", label: "המלצה" },
];

function App() {
  const [page, setPage] = useState<Page>("review");
  const [apiKey, setApiKey] = useState("");
  const [clientRequest, setClientRequest] = useState("");
  const [proposalText, setProposalText] = useState("");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<AnalysisStage | null>(null);
  const [error, setError] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reportInput, setReportInput] = useState<{ clientRequest: string; proposalText: string } | null>(null);

  useEffect(() => {
    const onError = (event: ErrorEvent) => console.error("Application error", event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => console.error("Application promise rejected", event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("page") === "properties") setPage("catalog");
    const propertyId = params.get("propertyId");
    if (propertyId) {
      setSelectedPropertyId(propertyId);
      setPage("catalog");
    }
  }, []);

  const inputChanged = Boolean(report && reportInput && (
    clientRequest.trim() !== reportInput.clientRequest || proposalText.trim() !== reportInput.proposalText
  ));

  async function handleRun() {
    if (!clientRequest.trim() || !proposalText.trim() || !apiKey.trim() || running || !parsedProperties.success) return;
    setRunning(true);
    setError("");
    setStage("screening");
    try {
      const result = await runAnalysis(createOpenAIClient(apiKey.trim()), propertyData, clientRequest.trim(), proposalText.trim(), setStage);
      setReport(result);
      setReportInput({ clientRequest: clientRequest.trim(), proposalText: proposalText.trim() });
    } catch (cause) {
      console.error("[analysis-error] Failed to analyze proposal", cause);
      const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
      const detailedError = getUserFacingApiError(cause);
      const recommendationError = message.startsWith("invalid_recommendation:")
        ? message.slice("invalid_recommendation:".length).trim()
        : "";
      const friendly: Record<string, string> = {
        missing_property_id: "לא נמצא מזהה נכס בפורמט DEMO-מספר בהצעה. יש לבקש מהמתווך להוסיף מזהה.",
        multiple_property_ids: "נמצאו כמה מזהי נכס שונים בהצעה. יש להשאיר מזהה נכס אחד בלבד.",
        invalid_property_id: "המזהה שחולץ אינו תואם למזהה DEMO שנמצא בטקסט. ההרצה נעצרה.",
        property_not_found: "מזהה הנכס לא נמצא במאגר. בדקו את המזהה ונסו שוב.",
        invalid_recommendation: recommendationError
          ? `ההמלצה שהמודל החזיר לא תואמת לכללי ההכרעה. ${recommendationError}. נסו שוב.`
          : "ההמלצה אינה עומדת בכללי ההכרעה. לא ניתן לאמת אותה. נסו שוב.",
      };
      setError(friendly[message] ?? (recommendationError ? friendly.invalid_recommendation : detailedError));
    } finally {
      setRunning(false);
      setStage(null);
    }
  }

  function openProperty(propertyId: string) {
    setSelectedPropertyId(propertyId);
    setPage("catalog");
    window.history.replaceState(null, "", `?page=properties&propertyId=${encodeURIComponent(propertyId)}`);
  }

  function navigate(next: Page) {
    setPage(next);
    setSelectedPropertyId(null);
    window.history.replaceState(null, "", next === "catalog" ? "?page=properties" : "/");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate("review"); }}>
          <span className="brand-mark"><Icon name="home" /></span>
          <span className="brand-copy"><strong>נכסקל</strong><small>בדיקת הצעות נדל״ן</small></span>
        </a>
        <nav className="main-nav" aria-label="ניווט ראשי">
          <button className={page === "review" ? "nav-link active" : "nav-link"} onClick={() => navigate("review")}><Icon name="scan" />בדיקת הצעה</button>
          <button className={page === "catalog" ? "nav-link active" : "nav-link"} onClick={() => navigate("catalog")}><Icon name="building" />מאגר נכסים <span className="nav-count">05</span></button>
        </nav>
      </header>

      <main className="main-content">
        {!parsedProperties.success && <div className="alert alert-danger"><Icon name="alert" /><span><strong>שגיאה במאגר הנכסים</strong><br />הבדיקה אינה זמינה עד לתיקון JSON הנכסים.</span></div>}
        {page === "review" ? (
            <ReviewPage
            apiKey={apiKey} setApiKey={setApiKey}
            clientRequest={clientRequest} setClientRequest={setClientRequest}
            proposalText={proposalText} setProposalText={setProposalText}
            running={running} stage={stage} report={report} error={error}
            inputChanged={inputChanged} onRun={handleRun} onOpenProperty={openProperty}
          />
        ) : (
          <CatalogPage
            properties={propertyData} query={search} setQuery={setSearch}
            selectedPropertyId={selectedPropertyId} setSelectedPropertyId={setSelectedPropertyId}
          />
        )}
      </main>
      <footer className="footer"><span>נכסקל <span className="footer-sep">·</span> כלי עזר לקבלת החלטות</span></footer>
    </div>
  );
}

function ReviewPage(props: {
  apiKey: string; setApiKey: (value: string) => void;
  clientRequest: string; setClientRequest: (value: string) => void;
  proposalText: string; setProposalText: (value: string) => void;
  running: boolean; stage: AnalysisStage | null; report: AnalysisReport | null; error: string;
  inputChanged: boolean; onRun: () => void; onOpenProperty: (id: string) => void;
}) {
  const ready = Boolean(props.apiKey.trim() && props.clientRequest.trim() && props.proposalText.trim() && !props.running);
  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />WORKSPACE / הצעות נכסים</div>
          <h1>בדיקת הצעה</h1>
          <p>בדקו התאמה בין בקשת הלקוח, הצעת המתווך ונתוני המאגר.</p>
        </div>
        <div className="heading-icon"><Icon name="clipboard" /></div>
      </section>

      <div className="review-layout">
        <section className="panel form-panel">
          <div className="panel-heading">
            <div className="step-mark">01</div>
            <div><h2>פרטי הבדיקה</h2><p>הזינו את הטקסטים כפי שנמסרו, ללא שינוי.</p></div>
            <span className="required-note"><i /> שדות חובה</span>
          </div>
          <div className="field-group">
            <label htmlFor="client-request"><span>בקשת הלקוח</span><span className="field-tag">CLIENT BRIEF</span></label>
            <textarea id="client-request" value={props.clientRequest} onChange={(event) => props.setClientRequest(event.target.value)} placeholder="לדוגמה: מחפשים דירה עם לפחות 4 חדרים, חניה ומעלית..." rows={5} />
            <div className="field-foot"><span>הדרישות יחולצו מהטקסט וייבדקו מול ההצעה.</span><span>{props.clientRequest.length} תווים</span></div>
          </div>
          <div className="field-group">
            <label htmlFor="broker-proposal"><span>הצעת המתווך</span><span className="field-tag">BROKER PROPOSAL</span></label>
            <textarea id="broker-proposal" value={props.proposalText} onChange={(event) => props.setProposalText(event.target.value)} placeholder="הדביקו את הצעת המתווך. יש לכלול מזהה נכס ופרטים שהוצגו ללקוח..." rows={6} />
            <div className="field-foot"><span>מזהה הנכס צריך להופיע בתוך ההצעה.</span><span>{props.proposalText.length} תווים</span></div>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); props.onRun(); }}>
            <div className="field-group api-field">
              <label htmlFor="api-key"><span>מפתח OpenAI API</span><span className="field-tag">SESSION ONLY</span></label>
              <div className="api-input"><Icon name="key" /><input id="api-key" type="password" autoComplete="off" spellCheck={false} value={props.apiKey} onChange={(event) => props.setApiKey(event.target.value)} placeholder="sk-••••••••••••••••••••••••••••" /><span className="secure-pill"><Icon name="shield" /> מוצפן בהעברה</span></div>
              <div className="field-foot"><span>המפתח לא נשמר בשרת או באחסון הדפדפן.</span><span>OpenAI</span></div>
            </div>
            {props.error && <div className="alert alert-danger form-error"><Icon name="alert" /><span>{props.error}</span></div>}
            <div className="form-actions">
              <button className="button button-primary" type="submit" disabled={!ready}>
                {props.running ? <><span className="spinner" />בודק הצעה...</> : <><Icon name="spark" />הרצת בדיקה<Icon name="arrow" /></>}
              </button>
              <span className="action-hint"><Icon name="clock" /> בדרך כלל פחות מדקה</span>
            </div>
            {props.running && props.stage && <StageProgress stage={props.stage} />}
          </form>
        </section>
      </div>
      {props.report && <ReportView report={props.report} onOpenProperty={props.onOpenProperty} />}
    </>
  );
}

function StageProgress({ stage }: { stage: AnalysisStage }) {
  const current = stages.findIndex((item) => item.id === stage);
  return <div className="stage-progress" aria-live="polite">{stages.map((item, index) => <div className={index < current ? "stage done" : index === current ? "stage current" : "stage"} key={item.id}><span>{index < current ? <Icon name="check" /> : String(index + 1).padStart(2, "0")}</span>{item.label}</div>)}</div>;
}

function ReportView({ report, onOpenProperty }: { report: AnalysisReport; onOpenProperty: (id: string) => void }) {
  const labelClass = report.recommendation.label === "מוכן לאישור" ? "recommendation-ready" : report.recommendation.label === "לא לאשר" ? "recommendation-stop" : "recommendation-review";
  return <section className="report-section">
    <div className="report-title"><div><div className="eyebrow"><span className="eyebrow-line" />RESULTS / תוצאות</div><h2>דוח בדיקת הצעה</h2></div><span className="report-property">נכס <button onClick={() => onOpenProperty(report.property.propertyId)}>{report.property.propertyId}<Icon name="external" /></button></span></div>
    <div className={`recommendation-card ${labelClass}`}><div className="recommendation-icon"><Icon name={report.recommendation.label === "מוכן לאישור" ? "check" : "alert"} /></div><div className="recommendation-main"><span className="recommendation-overline">המלצה למנהל</span><h3>{report.recommendation.label}</h3><p>{report.recommendation.summary}</p></div><div className="recommendation-note"><Icon name="info" /> ההמלצה אינה החלטה סופית</div></div>
    <div className="report-grid">
      <ComparisonTable title="הצעה מול המאגר" subtitle="בדיקת נתוני המתווך מול רשומת הנכס" rows={report.databaseComparisons} kind="database" />
      <ComparisonTable title="הצעה מול דרישות הלקוח" subtitle="בדיקת הדרישות מול פרטי ההצעה" rows={report.requirementComparisons} kind="requirements" />
    </div>
    <div className="insight-grid">
      <InsightCard title="נקודות חוזקה" icon="check" items={report.recommendation.strengths} empty="לא זוהו נקודות חוזקה." />
      <InsightCard
        title="פערים ונקודות לבדיקה"
        icon="alert"
        items={buildIssueItems(report)}
        empty="לא זוהו פערים או נקודות לבדיקה."
      />
    </div>
  </section>;
}

function buildIssueItems(report: AnalysisReport): string[] {
  const issues: string[] = [];
  for (const row of report.databaseComparisons) {
    if (row.status === "match") continue;
    const field = FIELD_LABELS[row.field] ?? row.field;
    if (row.status === "missing") {
      issues.push(`${field} — חסר בהצעת המתווך; במאגר מצוין: ${formatValue(row.databaseValue)}.`);
    } else if (row.status === "mismatch") {
      issues.push(`${field} — הצעת המתווך: ${formatValue(row.proposalValue)}; במאגר: ${formatValue(row.databaseValue)}.`);
    } else {
      issues.push(`${field} — לא ניתן לאמת מול המאגר.`);
    }
  }
  for (const row of report.requirementComparisons) {
    if (row.status === "match") continue;
    const field = FIELD_LABELS[row.field] ?? row.field;
    const importance = row.importance === "must" ? "דרישת חובה" : "העדפה";
    if (row.status === "missing") {
      issues.push(`${field} — ${importance} של הלקוח לא מופיעה בהצעת המתווך (בקשה: ${formatValue(row.requestedValue)}); צריך לברר אם היא מתקיימת.`);
    } else if (row.status === "mismatch") {
      issues.push(`${field} — ${importance} של הלקוח אינה מתקיימת: ביקש ${formatValue(row.requestedValue)}, ובהצעה צוין ${formatValue(row.proposalValue)}.`);
    } else {
      issues.push(`${field} — ${importance} של הלקוח לא אומתה בהצעה; בקשה: ${formatValue(row.requestedValue)}.`);
    }
  }
  for (const item of report.requirements.unparsedRequests) {
    issues.push(`בקשת לקוח שאין עליה מידע במאגר — ״${item.quote}״. ${item.reason}`);
  }
  for (const item of report.unverifiedClaims) {
    issues.push(`${item.claim} — המידע הזה לא מופיע במאגר, ולכן לא ניתן לאמת אותו. ציטוט מההצעה: ״${item.quote}״.`);
  }
  return issues;
}

function ComparisonTable({ title, subtitle, rows, kind }: { title: string; subtitle: string; rows: DatabaseComparison[] | RequirementComparison[]; kind: "database" | "requirements" }) {
  return <section className="panel comparison-panel"><div className="comparison-heading"><div><h3>{title}</h3><p>{subtitle}</p></div><span className="row-count">{String(rows.length).padStart(2, "0")} פרמטרים</span></div>
    <div className="comparison-list">
      {rows.map((row, index) => {
        const req = kind === "requirements" ? row as RequirementComparison : null;
        const db = kind === "database" ? row as DatabaseComparison : null;
        const status = row.status;
        const proposalValue = kind === "database" ? db!.proposalValue : req!.proposalValue;
        const sourceQuote = kind === "database" ? db!.proposalQuote : req!.requestQuote;
        const otherValue = kind === "database" ? db!.databaseValue : req!.requestedValue;
        return <details className="comparison-row" key={`${row.field}-${index}`}>
          <summary><span className="comparison-name">{FIELD_LABELS[row.field] ?? row.field}<small>{row.field}</small></span><span className="comparison-values"><b>{formatValue(proposalValue)}</b><i>{kind === "database" ? "מול" : operatorLabel(req!.operator)}</i><b>{formatValue(otherValue)}</b></span><StatusBadge status={status} preferenceMismatch={Boolean(req && req.importance === "preference" && status === "mismatch")} /><span className="expand-icon"><Icon name="chevron" /></span></summary>
          <div className="row-detail"><div><small>{kind === "database" ? "ציטוט מהצעת המתווך" : "ציטוט מבקשת הלקוח"}</small><p>״{sourceQuote ?? "לא צוין בהצעת המתווך"}״</p></div><div><small>{kind === "database" ? "ערך ברשומת המאגר" : `חשיבות: ${req!.importance === "must" ? "חובה" : "העדפה"}`}</small><p>{kind === "database" ? formatValue(otherValue) : formatValue(req!.requestedValue)}</p></div></div>
        </details>;
      })}
    </div>
  </section>;
}

function StatusBadge({ status, preferenceMismatch = false }: { status: string; preferenceMismatch?: boolean }) {
  const labels: Record<string, string> = { match: "תואם", mismatch: preferenceMismatch ? "העדפה שונה" : "פער", unknown: "לא מאומת", missing: "חסר" };
  return <span className={`status-badge status-${status}${preferenceMismatch ? " status-preference" : ""}`}><i />{labels[status] ?? status}</span>;
}

function InsightCard({ title, icon, items, empty }: { title: string; icon: string; items: Array<string | { text: string; evidence: string }>; empty: string }) {
  return <section className="insight-card"><h3><span className={`insight-icon insight-${icon}`}><Icon name={icon} /></span>{title}<small>{String(items.length).padStart(2, "0")}</small></h3>{items.length ? <ul>{items.map((item, index) => <li key={index}>{typeof item === "string" ? item : `${item.text} — ״${item.evidence}״`}</li>)}</ul> : <p className="empty-note">{empty}</p>}</section>;
}

function CatalogPage({ properties, query, setQuery, selectedPropertyId, setSelectedPropertyId }: {
  properties: Property[]; query: string; setQuery: (value: string) => void;
  selectedPropertyId: string | null; setSelectedPropertyId: (id: string | null) => void;
}) {
  useEffect(() => {
    const open = () => window.history.replaceState(null, "", "?page=properties");
    window.addEventListener("open-catalog", open);
    return () => window.removeEventListener("open-catalog", open);
  }, []);
  const filtered = properties.filter((property) => !query.trim()
    || property.propertyId.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    || property.city.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <>
    <section className="page-heading catalog-heading"><div><div className="eyebrow"><span className="eyebrow-line" />DATA / מאגר פנימי</div><h1>מאגר נכסים</h1><p>נתוני הנכסים המשמשים להשוואת הצעות.</p></div><div className="heading-icon"><Icon name="building" /></div></section>
    <section className="panel catalog-panel">
      <div className="catalog-toolbar"><div><h2>כל הנכסים <span>{String(filtered.length).padStart(2, "0")}</span></h2></div><label className="search-box"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש לפי מזהה או עיר" /><kbd>⌘ K</kbd></label></div>
      <div className="property-list">
        {filtered.map((property, index) => {
          const selected = selectedPropertyId === property.propertyId;
          return <article className={`property-card ${selected ? "selected" : ""}`} key={property.propertyId}>
            <button className="property-summary" onClick={() => setSelectedPropertyId(selected ? null : property.propertyId)} aria-expanded={selected}>
              <span className="property-index">{String(index + 1).padStart(2, "0")}</span><span className="property-location"><strong>{property.city}</strong><small>{property.propertyId}</small></span>
              <span className="property-metric"><small>מחיר</small><strong>{money(property.price)}</strong></span>
              <span className="property-metric"><small>חדרים</small><strong>{property.rooms}</strong></span>
              <span className="property-metric"><small>קומה</small><strong>{property.floor}</strong></span>
              <span className="expand-icon"><Icon name="chevron" /></span>
            </button>
            {selected && <div className="property-details"><div className="detail-grid">{[
              ["קומה", property.floor], ["מעלית", yesNo(property.elevator)], ["חניה", yesNo(property.parking)],
              ["ממ״ד", yesNo(property.safeRoom)], ["נגישות", yesNo(property.accessibility)],
              ["זמינות מתאריך", dateFormat(property.availableFrom)],
            ].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div></div>}
          </article>;
        })}
        {!filtered.length && <div className="no-results"><Icon name="search" /><strong>לא נמצאו נכסים</strong><span>נסו לחפש לפי מזהה או שם עיר אחר.</span></div>}
      </div>
    </section>
  </>;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (typeof value === "number" && value > 1000) return money(value);
  if (value === "new") return "חדש";
  if (value === "old") return "ישן";
  return String(value);
}
function operatorLabel(operator: string): string {
  return ({ eq: "=", gte: "לפחות", gt: "יותר מ־", lte: "עד", lt: "פחות מ־", between: "בין" } as Record<string, string>)[operator] ?? operator;
}
function money(value: number): string { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(value); }
function yesNo(value: boolean): string { return value ? "יש" : "אין"; }
function dateFormat(value: string): string { return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }

function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h14V9M9 21v-7h6v7" /></>,
    scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M7 12h10" /></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 21v-5h6v5M8 7h2m4 0h2M8 11h2m4 0h2" /></>,
    clipboard: <><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5V3h6v2M8 10h8M8 14h8M8 18h5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9m-3 3 3 3m-6 0 3 3" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
    text: <><path d="M4 6h16M4 12h10M4 18h13" /></>,
    compare: <><path d="M8 4H4v16h4M16 4h4v16h-4M9 8l-3 4 3 4m6-8 3 4-3 4" /></>,
    bulb: <><path d="M9 18h6m-5 4h4m-2-20a7 7 0 0 0-4 12.7c.6.4 1 1 1 1.8v.5h4v-.5c0-.8.4-1.4 1-1.8A7 7 0 0 0 12 2Z" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    external: <><path d="M14 3h7v7m0-7-9 9" /><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  };
  return <svg {...common}>{paths[name] ?? paths.info}</svg>;
}

export default App;
