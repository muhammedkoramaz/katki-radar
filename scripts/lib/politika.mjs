const AI_TERMS = [
  /\bai[- ]generated\b/, /\bllms?\b/, /\bchatgpt\b/, /\bcopilot\b/, /\bgenerative ai\b/,
  /\bai tools?\b/, /\bai[- ]assisted\b/, /\blanguage models?\b/, /\bartificial intelligence\b/, /\bgpt(?:-\d+)?\b/,
];
const BAN_TERMS = [
  /\bnot accept/, /\bnot be accepted\b/, /\bprohibit/, /\bban(?:s|ned)?\b/, /\bforbidden\b/,
  /\bwill be closed\b/, /\bdo not submit\b/, /\bnot allowed\b/, /\breject/, /\bno\b/, /\b(?:won't|wont|don't|dont|can't|cannot)\s+(?:accept|merge|allow)/,
];
const DISCLOSE_TERMS = [/\bdisclos(?:e|ure)\b/, /\bmust mention\b/, /\bindicate\b/];

const POLICY_PATHS = ['contents/CONTRIBUTING.md', 'contents/.github/CONTRIBUTING.md', 'contents/AI_POLICY.md', 'readme'];

export function splitSentences(text) {
  return text.toLowerCase().replace(/[‘’]/g, "'").split(/[.!?](?:\s|$)|\n\s*\n/).map((s) => s.trim()).filter(Boolean);
}

export function classifyAiPolicy(text) {
  let disclose = false;
  for (const sentence of splitSentences(text)) {
    if (!AI_TERMS.some((re) => re.test(sentence))) continue;
    if (BAN_TERMS.some((re) => re.test(sentence))) return 'YASAK';
    if (DISCLOSE_TERMS.some((re) => re.test(sentence))) disclose = true;
  }
  return disclose ? 'ACIKLAMA' : 'YOK';
}

export async function fetchPolicyTexts(client, fullName) {
  const parts = [];
  for (const p of POLICY_PATHS) {
    const part = await client.request(`/repos/${fullName}/${p}`, { raw: true }).catch(() => null);
    parts.push(part);
  }
  return { text: parts.filter(Boolean).join('\n\n'), readme: parts.at(-1) ?? '' };
}
