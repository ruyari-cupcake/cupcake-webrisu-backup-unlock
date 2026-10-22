// Samples the RSS of a Chromium instance (found by its profile path) and all its descendants
// every 500 ms until SIGTERM, then prints the peak per process type and the peak total.
// Usage: node rss-sampler.cjs <profile-path-substring>
const { execFileSync } = require('node:child_process');

const needle = process.argv[2];
const peaks = {};
let peakTotal = 0;

function sample() {
  const rows = execFileSync('ps', ['-eo', 'pid=,ppid=,rss=,args='], { encoding: 'utf8' })
    .trim().split('\n').map((line) => {
      const [pid, ppid, rss, ...args] = line.trim().split(/\s+/);
      return { pid: Number(pid), ppid: Number(ppid), rss: Number(rss), args: args.join(' ') };
    });
  const root = rows.find((row) => row.args.includes(needle) && !row.args.includes('--type=') && /chrom/i.test(row.args));
  if (!root) return;
  const family = new Set([root.pid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) if (!family.has(row.pid) && family.has(row.ppid)) { family.add(row.pid); grew = true; }
  }
  let total = 0;
  for (const row of rows.filter((r) => family.has(r.pid))) {
    const type = /--type=(\S+)/.exec(row.args)?.[1] || 'browser';
    peaks[type] = Math.max(peaks[type] || 0, row.rss);
    total += row.rss;
  }
  peakTotal = Math.max(peakTotal, total);
}

const timer = setInterval(sample, 500);
process.on('SIGTERM', () => {
  clearInterval(timer);
  const mib = (kib) => `${(kib / 1024).toFixed(0)} MiB`;
  console.log(JSON.stringify({ peakTotal: mib(peakTotal), peakByType: Object.fromEntries(Object.entries(peaks).map(([k, v]) => [k, mib(v)])) }));
  process.exit(0);
});
