import { log } from "@/lib/logger";

// Same isTauri-branch pattern as llmStream.ts's resolveEndpoint(): native
// Tauri hits arXiv directly (webview doesn't enforce CORS), web-dev mode
// goes through the /api/proxy/arxiv route in vite.config.ts.
function arxivApiBase(): string {
  const isTauri = "__TAURI_INTERNALS__" in window;
  return isTauri ? "https://export.arxiv.org/api/query" : "/api/proxy/arxiv/api/query";
}

// arXiv's usage guideline asks for no more than one request per 3 seconds.
// Module-level so it throttles across every caller (initial search, "load
// more", any future consumer) regardless of who's asking.
const ARXIV_MIN_INTERVAL_MS = 3000;
let lastArxivRequestAt = 0;

async function waitForArxivRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastArxivRequestAt;
  if (elapsed < ARXIV_MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, ARXIV_MIN_INTERVAL_MS - elapsed));
  }
  lastArxivRequestAt = Date.now();
}

// arXiv's own API docs document 503 as "temporarily overloaded, back off and
// retry" (sometimes with a Retry-After header) — worth a few retries rather
// than failing a search outright over a transient blip. Anything else (400,
// 404, ...) is a real error and isn't retried.
const ARXIV_MAX_RETRIES = 3;
const ARXIV_RETRY_BASE_DELAY_MS = 3000;

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const dateMs = Date.parse(header);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now());
}

async function fetchArxivWithRetry(url: string): Promise<Response> {
  for (let attempt = 0; attempt <= ARXIV_MAX_RETRIES; attempt++) {
    await waitForArxivRateLimit();
    const res = await fetch(url);
    if (res.ok) return res;
    if (res.status !== 503 && res.status !== 429) {
      throw new Error(`arXiv returned ${res.status}`);
    }
    if (attempt === ARXIV_MAX_RETRIES) {
      throw new Error(`arXiv returned ${res.status} after ${ARXIV_MAX_RETRIES} retries`);
    }
    const delay = parseRetryAfterMs(res.headers.get("Retry-After")) ?? ARXIV_RETRY_BASE_DELAY_MS * (attempt + 1);
    log.explore.info("arXiv request throttled/overloaded, retrying", { status: res.status, attempt, delayMs: delay });
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  // unreachable — the loop always returns or throws — but keeps TS happy
  throw new Error("arXiv request failed");
}

export type ArxivCategoryGroup = {
  label: string;
  // Category code(s) this whole archive/group maps to in "General" mode —
  // a wildcard (e.g. "cs.*") when the group is cleanly one dotted prefix,
  // or multiple exact codes when it spans separate top-level archives that
  // don't share a prefix (e.g. hep-ex/hep-lat/hep-ph/hep-th).
  generalValues: string[];
  categories: { value: string; label: string }[];
};

// Builds the arXiv `cat:` query fragment for one or more category values —
// a single `cat:X`, or `(cat:X OR cat:Y OR ...)` for multiple. Verified
// against the real API: both `cat:cs.*` wildcards and parenthesized
// `cat:A OR cat:B` boolean groups are supported.
export function buildCategoryFragment(values: string[]): string {
  const nonEmpty = values.filter(Boolean);
  if (nonEmpty.length === 0) return "";
  if (nonEmpty.length === 1) return `cat:${nonEmpty[0]}`;
  return `(${nonEmpty.map((v) => `cat:${v}`).join(" OR ")})`;
}

// arXiv's full taxonomy (~155 categories), grouped the way arxiv.org itself
// groups its archives. "" (handled separately by the caller) means no filter.
export const ARXIV_CATEGORY_GROUPS: ArxivCategoryGroup[] = [
  {
    label: "Computer Science",
    generalValues: ["cs.*"],
    categories: [
      { value: "cs.AI", label: "Artificial Intelligence" },
      { value: "cs.AR", label: "Hardware Architecture" },
      { value: "cs.CC", label: "Computational Complexity" },
      { value: "cs.CE", label: "Computational Engineering, Finance, and Science" },
      { value: "cs.CG", label: "Computational Geometry" },
      { value: "cs.CL", label: "Computation and Language" },
      { value: "cs.CR", label: "Cryptography and Security" },
      { value: "cs.CV", label: "Computer Vision and Pattern Recognition" },
      { value: "cs.CY", label: "Computers and Society" },
      { value: "cs.DB", label: "Databases" },
      { value: "cs.DC", label: "Distributed, Parallel, and Cluster Computing" },
      { value: "cs.DL", label: "Digital Libraries" },
      { value: "cs.DM", label: "Discrete Mathematics" },
      { value: "cs.DS", label: "Data Structures and Algorithms" },
      { value: "cs.ET", label: "Emerging Technologies" },
      { value: "cs.FL", label: "Formal Languages and Automata Theory" },
      { value: "cs.GL", label: "General Literature" },
      { value: "cs.GR", label: "Graphics" },
      { value: "cs.GT", label: "Computer Science and Game Theory" },
      { value: "cs.HC", label: "Human-Computer Interaction" },
      { value: "cs.IR", label: "Information Retrieval" },
      { value: "cs.IT", label: "Information Theory" },
      { value: "cs.LG", label: "Machine Learning" },
      { value: "cs.LO", label: "Logic in Computer Science" },
      { value: "cs.MA", label: "Multiagent Systems" },
      { value: "cs.MM", label: "Multimedia" },
      { value: "cs.MS", label: "Mathematical Software" },
      { value: "cs.NA", label: "Numerical Analysis" },
      { value: "cs.NE", label: "Neural and Evolutionary Computing" },
      { value: "cs.NI", label: "Networking and Internet Architecture" },
      { value: "cs.OH", label: "Other Computer Science" },
      { value: "cs.OS", label: "Operating Systems" },
      { value: "cs.PF", label: "Performance" },
      { value: "cs.PL", label: "Programming Languages" },
      { value: "cs.RO", label: "Robotics" },
      { value: "cs.SC", label: "Symbolic Computation" },
      { value: "cs.SD", label: "Sound" },
      { value: "cs.SE", label: "Software Engineering" },
      { value: "cs.SI", label: "Social and Information Networks" },
      { value: "cs.SY", label: "Systems and Control" },
    ],
  },
  {
    label: "Economics",
    generalValues: ["econ.*"],
    categories: [
      { value: "econ.EM", label: "Econometrics" },
      { value: "econ.GN", label: "General Economics" },
      { value: "econ.TH", label: "Theoretical Economics" },
    ],
  },
  {
    label: "Electrical Engineering and Systems Science",
    generalValues: ["eess.*"],
    categories: [
      { value: "eess.AS", label: "Audio and Speech Processing" },
      { value: "eess.IV", label: "Image and Video Processing" },
      { value: "eess.SP", label: "Signal Processing" },
      { value: "eess.SY", label: "Systems and Control" },
    ],
  },
  {
    label: "Mathematics",
    generalValues: ["math.*"],
    categories: [
      { value: "math.AC", label: "Commutative Algebra" },
      { value: "math.AG", label: "Algebraic Geometry" },
      { value: "math.AP", label: "Analysis of PDEs" },
      { value: "math.AT", label: "Algebraic Topology" },
      { value: "math.CA", label: "Classical Analysis and ODEs" },
      { value: "math.CO", label: "Combinatorics" },
      { value: "math.CT", label: "Category Theory" },
      { value: "math.CV", label: "Complex Variables" },
      { value: "math.DG", label: "Differential Geometry" },
      { value: "math.DS", label: "Dynamical Systems" },
      { value: "math.FA", label: "Functional Analysis" },
      { value: "math.GM", label: "General Mathematics" },
      { value: "math.GN", label: "General Topology" },
      { value: "math.GR", label: "Group Theory" },
      { value: "math.GT", label: "Geometric Topology" },
      { value: "math.HO", label: "History and Overview" },
      { value: "math.IT", label: "Information Theory" },
      { value: "math.KT", label: "K-Theory and Homology" },
      { value: "math.LO", label: "Logic" },
      { value: "math.MG", label: "Metric Geometry" },
      { value: "math.MP", label: "Mathematical Physics" },
      { value: "math.NA", label: "Numerical Analysis" },
      { value: "math.NT", label: "Number Theory" },
      { value: "math.OA", label: "Operator Algebras" },
      { value: "math.OC", label: "Optimization and Control" },
      { value: "math.PR", label: "Probability" },
      { value: "math.QA", label: "Quantum Algebra" },
      { value: "math.RA", label: "Rings and Algebras" },
      { value: "math.RT", label: "Representation Theory" },
      { value: "math.SG", label: "Symplectic Geometry" },
      { value: "math.SP", label: "Spectral Theory" },
      { value: "math.ST", label: "Statistics Theory" },
    ],
  },
  {
    label: "Physics",
    generalValues: ["physics.*"],
    categories: [
      { value: "physics.acc-ph", label: "Accelerator Physics" },
      { value: "physics.ao-ph", label: "Atmospheric and Oceanic Physics" },
      { value: "physics.app-ph", label: "Applied Physics" },
      { value: "physics.atm-clus", label: "Atomic and Molecular Clusters" },
      { value: "physics.atom-ph", label: "Atomic Physics" },
      { value: "physics.bio-ph", label: "Biological Physics" },
      { value: "physics.chem-ph", label: "Chemical Physics" },
      { value: "physics.class-ph", label: "Classical Physics" },
      { value: "physics.comp-ph", label: "Computational Physics" },
      { value: "physics.data-an", label: "Data Analysis, Statistics and Probability" },
      { value: "physics.ed-ph", label: "Physics Education" },
      { value: "physics.flu-dyn", label: "Fluid Dynamics" },
      { value: "physics.gen-ph", label: "General Physics" },
      { value: "physics.geo-ph", label: "Geophysics" },
      { value: "physics.hist-ph", label: "History and Philosophy of Physics" },
      { value: "physics.ins-det", label: "Instrumentation and Detectors" },
      { value: "physics.med-ph", label: "Medical Physics" },
      { value: "physics.optics", label: "Optics" },
      { value: "physics.plasm-ph", label: "Plasma Physics" },
      { value: "physics.pop-ph", label: "Popular Physics" },
      { value: "physics.soc-ph", label: "Physics and Society" },
      { value: "physics.space-ph", label: "Space Physics" },
    ],
  },
  {
    label: "Astrophysics",
    generalValues: ["astro-ph.*"],
    categories: [
      { value: "astro-ph.CO", label: "Cosmology and Nongalactic Astrophysics" },
      { value: "astro-ph.EP", label: "Earth and Planetary Astrophysics" },
      { value: "astro-ph.GA", label: "Astrophysics of Galaxies" },
      { value: "astro-ph.HE", label: "High Energy Astrophysical Phenomena" },
      { value: "astro-ph.IM", label: "Instrumentation and Methods for Astrophysics" },
      { value: "astro-ph.SR", label: "Solar and Stellar Astrophysics" },
    ],
  },
  {
    label: "Condensed Matter",
    generalValues: ["cond-mat.*"],
    categories: [
      { value: "cond-mat.dis-nn", label: "Disordered Systems and Neural Networks" },
      { value: "cond-mat.mes-hall", label: "Mesoscale and Nanoscale Physics" },
      { value: "cond-mat.mtrl-sci", label: "Materials Science" },
      { value: "cond-mat.other", label: "Other Condensed Matter" },
      { value: "cond-mat.quant-gas", label: "Quantum Gases" },
      { value: "cond-mat.soft", label: "Soft Condensed Matter" },
      { value: "cond-mat.stat-mech", label: "Statistical Mechanics" },
      { value: "cond-mat.str-el", label: "Strongly Correlated Electrons" },
      { value: "cond-mat.supr-con", label: "Superconductivity" },
    ],
  },
  {
    label: "General Relativity and Quantum Cosmology",
    generalValues: ["gr-qc"],
    categories: [
      { value: "gr-qc", label: "General Relativity and Quantum Cosmology" },
    ],
  },
  {
    label: "High Energy Physics",
    generalValues: ["hep-ex", "hep-lat", "hep-ph", "hep-th"],
    categories: [
      { value: "hep-ex", label: "High Energy Physics - Experiment" },
      { value: "hep-lat", label: "High Energy Physics - Lattice" },
      { value: "hep-ph", label: "High Energy Physics - Phenomenology" },
      { value: "hep-th", label: "High Energy Physics - Theory" },
    ],
  },
  {
    label: "Mathematical Physics",
    generalValues: ["math-ph"],
    categories: [
      { value: "math-ph", label: "Mathematical Physics" },
    ],
  },
  {
    label: "Nonlinear Sciences",
    generalValues: ["nlin.*"],
    categories: [
      { value: "nlin.AO", label: "Adaptation and Self-Organizing Systems" },
      { value: "nlin.CD", label: "Chaotic Dynamics" },
      { value: "nlin.CG", label: "Cellular Automata and Lattice Gases" },
      { value: "nlin.PS", label: "Pattern Formation and Solitons" },
      { value: "nlin.SI", label: "Exactly Solvable and Integrable Systems" },
    ],
  },
  {
    label: "Nuclear Physics",
    generalValues: ["nucl-ex", "nucl-th"],
    categories: [
      { value: "nucl-ex", label: "Nuclear Experiment" },
      { value: "nucl-th", label: "Nuclear Theory" },
    ],
  },
  {
    label: "Quantum Physics",
    generalValues: ["quant-ph"],
    categories: [
      { value: "quant-ph", label: "Quantum Physics" },
    ],
  },
  {
    label: "Quantitative Biology",
    generalValues: ["q-bio.*"],
    categories: [
      { value: "q-bio.BM", label: "Biomolecules" },
      { value: "q-bio.CB", label: "Cell Behavior" },
      { value: "q-bio.GN", label: "Genomics" },
      { value: "q-bio.MN", label: "Molecular Networks" },
      { value: "q-bio.NC", label: "Neurons and Cognition" },
      { value: "q-bio.OT", label: "Other Quantitative Biology" },
      { value: "q-bio.PE", label: "Populations and Evolution" },
      { value: "q-bio.QM", label: "Quantitative Methods" },
      { value: "q-bio.SC", label: "Subcellular Processes" },
      { value: "q-bio.TO", label: "Tissues and Organs" },
    ],
  },
  {
    label: "Quantitative Finance",
    generalValues: ["q-fin.*"],
    categories: [
      { value: "q-fin.CP", label: "Computational Finance" },
      { value: "q-fin.EC", label: "Economics" },
      { value: "q-fin.GN", label: "General Finance" },
      { value: "q-fin.MF", label: "Mathematical Finance" },
      { value: "q-fin.PM", label: "Portfolio Management" },
      { value: "q-fin.PR", label: "Pricing of Securities" },
      { value: "q-fin.RM", label: "Risk Management" },
      { value: "q-fin.ST", label: "Statistical Finance" },
      { value: "q-fin.TR", label: "Trading and Market Microstructure" },
    ],
  },
  {
    label: "Statistics",
    generalValues: ["stat.*"],
    categories: [
      { value: "stat.AP", label: "Applications" },
      { value: "stat.CO", label: "Computation" },
      { value: "stat.ME", label: "Methodology" },
      { value: "stat.ML", label: "Machine Learning" },
      { value: "stat.OT", label: "Other Statistics" },
      { value: "stat.TH", label: "Statistics Theory" },
    ],
  },
];

export type ArxivPaper = {
  id: string; // short id, e.g. "2107.03374v1"
  title: string;
  authors: string[];
  summary: string;
  published: string; // ISO date string
  categories: string[];
  pdfUrl: string;
  arxivUrl: string;
};

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function parseEntry(entry: Element): ArxivPaper {
  const rawId = text(entry.getElementsByTagName("id")[0]);
  const id = rawId.split("/abs/")[1] ?? rawId;

  const authors = Array.from(entry.getElementsByTagName("author"))
    .map((a) => text(a.getElementsByTagName("name")[0]))
    .filter(Boolean);

  const categories = Array.from(entry.getElementsByTagName("category"))
    .map((c) => c.getAttribute("term") ?? "")
    .filter(Boolean);

  const links = Array.from(entry.getElementsByTagName("link"));
  const pdfLink = links.find((l) => l.getAttribute("title") === "pdf");
  const pdfUrl = pdfLink?.getAttribute("href") ?? (id ? `https://arxiv.org/pdf/${id}` : "");

  return {
    id,
    title: text(entry.getElementsByTagName("title")[0]),
    authors,
    summary: text(entry.getElementsByTagName("summary")[0]),
    published: text(entry.getElementsByTagName("published")[0]),
    categories,
    pdfUrl,
    arxivUrl: rawId || (id ? `https://arxiv.org/abs/${id}` : ""),
  };
}

// arXiv ORs space-separated words within a single `all:` field rather than
// ANDing them or matching a phrase (verified live — see queryRewriter.ts)
// — so a query rewritten into short key phrases needs each phrase quoted
// AND'd as its own `all:"..."` clause to actually narrow results, not just
// concatenated back into one field. A plain string (rewriting skipped or
// failed) falls back to the old single `all:` behavior.
function buildIntentFragment(query: string | string[]): string {
  if (Array.isArray(query)) {
    return query.map((phrase) => `all:"${phrase.replace(/"/g, "")}"`).join(" AND ");
  }
  return `all:${query}`;
}

export async function searchArxiv(
  query: string | string[],
  opts: { categoryValues?: string[]; maxResults?: number; start?: number } = {},
): Promise<ArxivPaper[]> {
  const { categoryValues, maxResults = 20, start = 0 } = opts;
  const categoryFragment = categoryValues && categoryValues.length > 0 ? buildCategoryFragment(categoryValues) : "";
  const intentFragment = buildIntentFragment(query);
  const searchQuery = categoryFragment ? `${intentFragment} AND ${categoryFragment}` : intentFragment;
  const params = new URLSearchParams({
    search_query: searchQuery,
    start: String(start),
    max_results: String(maxResults),
    sortBy: "relevance",
    sortOrder: "descending",
  });

  const res = await fetchArxivWithRetry(`${arxivApiBase()}?${params.toString()}`);

  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Failed to parse arXiv response");
  }

  return Array.from(doc.getElementsByTagName("entry")).map(parseEntry);
}
