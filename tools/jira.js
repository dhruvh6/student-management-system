#!/usr/bin/env node
/* Minimal Jira Cloud REST client for the Student Management System project.
   No dependencies - uses the fetch and file APIs built into Node.

   Credentials are read from ~/.jira.env, deliberately outside this repo:
   the Dockerfile copies the whole directory into the nginx web root, so any
   secret stored here would be served over HTTP by the running container. */

const fs = require('fs');
const os = require('os');
const path = require('path');

const CRED_FILE = process.env.JIRA_ENV_FILE || path.join(os.homedir(), '.jira.env');
const API = '/rest/api/3';

/* ---------- configuration ---------- */

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    out[key] = value;
  }
  return out;
}

function config() {
  const file = parseEnvFile(CRED_FILE);
  // Real environment variables win over the credentials file.
  const get = (key) => (process.env[key] || file[key] || '').trim();

  let baseUrl = get('JIRA_BASE_URL');
  const email = get('JIRA_EMAIL');
  const token = get('JIRA_API_TOKEN');

  const missing = [];
  if (!baseUrl) missing.push('JIRA_BASE_URL');
  if (!email) missing.push('JIRA_EMAIL');
  if (!token) missing.push('JIRA_API_TOKEN');
  if (missing.length) {
    throw new Error(
      `missing ${missing.join(', ')}\n` +
      `Set them in ${CRED_FILE} - see the setup notes at the bottom of this file.`
    );
  }

  if (!/^https?:\/\//.test(baseUrl)) baseUrl = 'https://' + baseUrl;
  baseUrl = baseUrl.replace(/\/+$/, '');

  return { baseUrl, email, token };
}

/* ---------- transport ---------- */

async function api(endpoint, { method = 'GET', body } = {}) {
  const { baseUrl, email, token } = config();
  const auth = Buffer.from(`${email}:${token}`).toString('base64');

  let res;
  try {
    res = await fetch(baseUrl + endpoint, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    // fetch collapses DNS, TLS and connection faults into "fetch failed".
    const cause = err.cause?.code || err.cause?.message || err.message;
    throw new Error(`could not reach ${baseUrl} (${cause})\nCheck JIRA_BASE_URL - it should look like https://your-site.atlassian.net`);
  }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    const hint = {
      401: 'Auth rejected. Check JIRA_EMAIL matches the account that created the token, and that the token has not been revoked.',
      403: 'Authenticated but not permitted. Your account may lack access to this project, or the site requires a fresh token.',
      404: 'Not found. Check the site URL and the issue or project key.',
      410: 'Endpoint retired by Atlassian.'
    }[res.status];
    throw new Error(`HTTP ${res.status} on ${endpoint}${hint ? '\n' + hint : ''}${detail ? '\n' + detail : ''}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

/* Atlassian replaced GET /search with GET /search/jql. Try the current
   endpoint, fall back to the legacy one on older or unmigrated sites. */
async function search(jql, { max = 50, fields = 'summary,status,assignee,issuetype' } = {}) {
  const q = new URLSearchParams({ jql, maxResults: String(max), fields });
  try {
    return await api(`${API}/search/jql?${q}`);
  } catch (err) {
    if (!/HTTP (404|410)/.test(err.message)) throw err;
    return api(`${API}/search?${q}`);
  }
}

/* ---------- write helpers ---------- */

/* API v3 wants rich text as Atlassian Document Format, not a plain string.
   This covers the subset used here: headings, bullet and numbered lists,
   and paragraphs. */
function textToAdf(text) {
  const out = [];
  let list = null;
  let para = [];

  const listItem = (t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
  const flushList = () => { if (list) { out.push({ type: list.type, content: list.items }); list = null; } };
  const flushPara = () => { if (para.length) { out.push({ type: 'paragraph', content: [{ type: 'text', text: para.join(' ') }] }); para = []; } };

  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);

    if (heading) {
      flushPara(); flushList();
      out.push({ type: 'heading', attrs: { level: Math.min(heading[1].length + 1, 6) }, content: [{ type: 'text', text: heading[2] }] });
    } else if (bullet) {
      flushPara();
      if (list && list.type !== 'bulletList') flushList();
      if (!list) list = { type: 'bulletList', items: [] };
      list.items.push(listItem(bullet[1]));
    } else if (numbered) {
      flushPara();
      if (list && list.type !== 'orderedList') flushList();
      if (!list) list = { type: 'orderedList', items: [] };
      list.items.push(listItem(numbered[1]));
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara(); flushList();
  if (!out.length) out.push({ type: 'paragraph', content: [{ type: 'text', text: ' ' }] });
  return { type: 'doc', version: 1, content: out };
}

/* Turns a display name into an accountId. Only names are ever printed -
   the user records also carry email addresses and those stay unread. */
async function resolveAssignee(project, who) {
  if (/^\d+:[0-9a-f-]{20,}$/i.test(who)) return { accountId: who, displayName: '(by accountId)', exact: true };

  const users = await api(`${API}/user/assignable/search?project=${encodeURIComponent(project)}&query=${encodeURIComponent(who)}&maxResults=50`);
  const wanted = who.trim().toLowerCase();
  const exact = users.filter((u) => (u.displayName || '').trim().toLowerCase() === wanted);
  const pool = exact.length ? exact : users;

  if (!pool.length) throw new Error(`no assignable user on ${project} matching "${who}"`);
  if (pool.length > 1) throw new Error(`"${who}" is ambiguous on ${project}: ${pool.map((u) => u.displayName).join(', ')}`);

  // Jira's search is fuzzy, so a near miss resolves to a real person. Never
  // let that happen silently on a write - the caller must see the drift.
  return { accountId: pool[0].accountId, displayName: pool[0].displayName, exact: exact.length > 0 };
}

function assigneeLabel(resolved, typed) {
  return resolved.exact
    ? resolved.displayName
    : `${resolved.displayName}  <- FUZZY MATCH, you typed "${typed}"`;
}

function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) { rest.push(arg); continue; }
    const key = arg.slice(2);
    if (key === 'yes') flags.yes = true;
    else flags[key] = args[++i];
  }
  return { flags, rest };
}

/* ---------- output helpers ---------- */

function table(rows, headers) {
  if (!rows.length) return '(no results)';
  const all = [headers, ...rows];
  const widths = headers.map((_, i) => Math.max(...all.map((r) => String(r[i] ?? '').length)));
  const render = (r) => r.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ').trimEnd();
  return [render(headers), render(widths.map((w) => '-'.repeat(w))), ...rows.map(render)].join('\n');
}

const issueRow = (i) => [
  i.key,
  i.fields.issuetype?.name ?? '',
  i.fields.status?.name ?? '',
  i.fields.assignee?.displayName ?? 'Unassigned',
  i.fields.summary ?? ''
];

/* ---------- commands ---------- */

const commands = {
  async whoami() {
    const me = await api(`${API}/myself`);
    console.log(`Connected to ${config().baseUrl}`);
    console.log(`  Name      ${me.displayName}`);
    console.log(`  Account   ${me.accountId}`);
    console.log(`  Timezone  ${me.timeZone ?? '-'}`);
    console.log(`  Active    ${me.active}`);
  },

  async projects() {
    const data = await api(`${API}/project/search?maxResults=50&orderBy=key`);
    console.log(table(data.values.map((p) => [p.key, p.name, p.projectTypeKey ?? '']), ['KEY', 'NAME', 'TYPE']));
  },

  async issues(arg) {
    // A bare project key is a convenience shorthand for the obvious JQL.
    const jql = !arg
      ? 'ORDER BY updated DESC'
      : /^[A-Za-z][A-Za-z0-9_]*$/.test(arg)
        ? `project = ${arg.toUpperCase()} ORDER BY key ASC`
        : arg;
    const data = await search(jql);
    console.log(`JQL: ${jql}\n`);
    console.log(table((data.issues ?? []).map(issueRow), ['KEY', 'TYPE', 'STATUS', 'ASSIGNEE', 'SUMMARY']));
  },

  async issue(key) {
    if (!key) throw new Error('usage: jira issue <ISSUE-KEY>');
    const i = await api(`${API}/issue/${encodeURIComponent(key)}?fields=summary,status,assignee,reporter,issuetype,priority,created,updated,description`);
    console.log(`${i.key}  ${i.fields.summary}`);
    console.log(`  Type      ${i.fields.issuetype?.name ?? '-'}`);
    console.log(`  Status    ${i.fields.status?.name ?? '-'}`);
    console.log(`  Assignee  ${i.fields.assignee?.displayName ?? 'Unassigned'}`);
    console.log(`  Reporter  ${i.fields.reporter?.displayName ?? '-'}`);
    console.log(`  Priority  ${i.fields.priority?.name ?? '-'}`);
    console.log(`  Created   ${i.fields.created ?? '-'}`);
    console.log(`  Updated   ${i.fields.updated ?? '-'}`);
    console.log(`  Link      ${config().baseUrl}/browse/${i.key}`);
  },

  async transitions(key) {
    if (!key) throw new Error('usage: jira transitions <ISSUE-KEY>');
    const data = await api(`${API}/issue/${encodeURIComponent(key)}/transitions`);
    console.log(table(data.transitions.map((t) => [t.id, t.name, t.to?.name ?? '']), ['ID', 'TRANSITION', 'MOVES TO']));
  },

  /* --- writes below: every one is a dry run unless --yes is passed --- */

  async create(...args) {
    const { flags } = parseFlags(args);
    if (!flags.summary) {
      throw new Error('usage: create --summary "..." [--project SMS] [--type Story] [--assignee "Name"] [--description-file FILE] [--yes]');
    }
    const project = (flags.project || 'SMS').toUpperCase();
    const type = flags.type || 'Story';
    const description = flags['description-file'] ? textToAdf(fs.readFileSync(flags['description-file'], 'utf8')) : null;
    const resolved = flags.assignee ? await resolveAssignee(project, flags.assignee) : null;

    if (!flags.yes) {
      console.log('DRY RUN - nothing written. Re-run with --yes to create.');
      console.log(`  project     ${project}`);
      console.log(`  type        ${type}`);
      console.log(`  summary     ${flags.summary}`);
      console.log(`  assignee    ${resolved ? assigneeLabel(resolved, flags.assignee) : '(unassigned)'}`);
      console.log(`  description ${description ? description.content.length + ' blocks' : '(none)'}`);
      return;
    }

    const fields = { project: { key: project }, issuetype: { name: type }, summary: flags.summary };
    if (description) fields.description = description;
    if (resolved) fields.assignee = { accountId: resolved.accountId };

    const made = await api(`${API}/issue`, { method: 'POST', body: { fields } });
    console.log(`Created ${made.key}  ${config().baseUrl}/browse/${made.key}`);
  },

  async assign(key, who, ...args) {
    const { flags } = parseFlags(args);
    if (!key || !who) throw new Error('usage: assign <ISSUE-KEY> "<Name>" [--yes]');
    const resolved = await resolveAssignee(key.split('-')[0], who);

    if (!flags.yes) { console.log(`DRY RUN - would assign ${key} to ${assigneeLabel(resolved, who)}. Re-run with --yes.`); return; }
    await api(`${API}/issue/${encodeURIComponent(key)}/assignee`, { method: 'PUT', body: { accountId: resolved.accountId } });
    console.log(`${key} assigned to ${resolved.displayName}`);
  },

  async comment(key, ...args) {
    const { flags, rest } = parseFlags(args);
    const text = flags.file ? fs.readFileSync(flags.file, 'utf8') : rest.join(' ');
    if (!key || !text.trim()) throw new Error('usage: comment <ISSUE-KEY> "text" | --file FILE [--yes]');

    if (!flags.yes) { console.log(`DRY RUN - would comment ${text.length} chars on ${key}. Re-run with --yes.`); return; }
    await api(`${API}/issue/${encodeURIComponent(key)}/comment`, { method: 'POST', body: { body: textToAdf(text) } });
    console.log(`Comment added to ${key}`);
  },

  async move(key, ...args) {
    const { flags, rest } = parseFlags(args);
    const target = rest.join(' ');
    if (!key || !target) throw new Error('usage: move <ISSUE-KEY> "<Status>" [--yes]');

    const { transitions } = await api(`${API}/issue/${encodeURIComponent(key)}/transitions`);
    const label = (t) => t.to?.name || t.name;
    const hit = transitions.find((t) => label(t).toLowerCase() === target.toLowerCase())
             || transitions.find((t) => t.name.toLowerCase() === target.toLowerCase());
    if (!hit) throw new Error(`no transition to "${target}" on ${key}. Available: ${transitions.map(label).join(', ')}`);

    if (!flags.yes) { console.log(`DRY RUN - would move ${key} to ${label(hit)} via "${hit.name}". Re-run with --yes.`); return; }
    await api(`${API}/issue/${encodeURIComponent(key)}/transitions`, { method: 'POST', body: { transition: { id: hit.id } } });
    console.log(`${key} moved to ${label(hit)}`);
  },

  // Escape hatch for any read endpoint not wrapped above.
  async raw(endpoint) {
    if (!endpoint) throw new Error('usage: jira raw /rest/api/3/<endpoint>');
    console.log(JSON.stringify(await api(endpoint), null, 2));
  },

  help() {
    console.log(`Jira API client for this project.

  node tools/jira.js whoami              verify the connection
  node tools/jira.js projects            list projects you can see
  node tools/jira.js issues [KEY|JQL]    list issues (e.g. SMS, or full JQL)
  node tools/jira.js issue SMS-1         show one issue
  node tools/jira.js transitions SMS-1   show available status transitions
  node tools/jira.js raw <endpoint>      GET any REST endpoint as JSON

Writes - all of these do nothing until you add --yes:

  node tools/jira.js create --summary "..." --type Story --assignee "Name" \\
                            --description-file FILE [--yes]
  node tools/jira.js assign SMS-11 "Name" [--yes]
  node tools/jira.js comment SMS-11 "text" | --file FILE [--yes]
  node tools/jira.js move SMS-11 "In Progress" [--yes]

Credentials are read from ${CRED_FILE} (override with JIRA_ENV_FILE).`);
  }
};

/* ---------- entry point ---------- */

(async () => {
  const [cmd = 'help', ...args] = process.argv.slice(2);
  const run = commands[cmd];
  if (!run) {
    console.error(`Unknown command: ${cmd}\n`);
    commands.help();
    process.exit(2);
  }
  try {
    await run(...args);
  } catch (err) {
    // Never let a token reach the terminal, even inside an error body.
    const token = (process.env.JIRA_API_TOKEN || parseEnvFile(CRED_FILE).JIRA_API_TOKEN || '').trim();
    let message = err.message;
    if (token) message = message.split(token).join('***REDACTED***');
    console.error('Error: ' + message);
    process.exit(1);
  }
})();

/* Setup
   -----
   1. Create a token at https://id.atlassian.com/manage-profile/security/api-tokens
   2. Write ~/.jira.env (outside this repo) with:
        JIRA_BASE_URL=https://your-site.atlassian.net
        JIRA_EMAIL=you@example.com
        JIRA_API_TOKEN=your-token
   3. chmod 600 ~/.jira.env
   4. node tools/jira.js whoami                                              */
