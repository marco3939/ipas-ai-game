// Per-question numeric verification of A_ARRAY calculation questions.
// Each verifier returns the expected `answer` numeric string, formatted to match the recorded answer.
const fs = require('fs');
const path = require('path');

function getQuestion(file, id) {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'));
  return d.questions.find(q => q.id === id);
}

const verifiers = {
  q_n2_cv_005: (c) => {
    return Math.floor((+c.in_size + 2*(+c.p) - (+c.k))/(+c.s)) + 1;
  },
  q_n2_cv_015: (c) => {
    return (+c.inter)/(+c.union);
  },
  q_n6_002: (c) => {
    const t=+c.tpr, p=+c.prior, f=+c.fpr;
    return t*p/(t*p + f*(1-p));
  },
  q_n6_012: (c) => {
    const r = (+c.n2)/(+c.n1);
    return r*r;
  },
  q_n6_017: (c) => {
    return 1/(1+Math.exp(-(+c.z)));
  },
  q_n6_021: (c) => {
    const a = c.a.split(',').map(s=>+s.trim());
    const b = c.b.split(',').map(s=>+s.trim());
    const ca = +c.ca, cb = +c.cb;
    const sse = (g,m)=>g.reduce((s,x)=>s+(x-m)**2,0);
    return sse(a,ca)+sse(b,cb);
  },
  q_0006: (c) => {
    const p=+c.p, r=+c.r;
    return 2*p*r/(p+r);
  },
  // Population Stability Index PSI = sum (a-b) * ln(a/b)
  q_n5_018: (c) => {
    const ta = +c.train_a/100, tb = +c.train_b/100, ca = +c.cur_a/100, cb = +c.cur_b/100;
    const psi = (ca-ta)*Math.log(ca/ta) + (cb-tb)*Math.log(cb/tb);
    return psi;
  },
  // Linear BS scaling with 10% buffer: new_bs = orig_bs * (limit_mem * 0.9) / peak_mem
  q_n5_024: (c) => {
    return Math.floor((+c.orig_bs) * ((+c.limit_mem)*0.9) / (+c.peak_mem));
  },
  // PCA: required PCs to reach >= 80% cumulative variance
  q_n7_dl_019: (c) => {
    const lams = [+c.l1, +c.l2, +c.l3, +c.l4];
    const total = lams.reduce((a,b)=>a+b,0);
    const thresh = 0.8;
    let cumul = 0;
    for (let i=0;i<lams.length;i++){
      cumul += lams[i];
      if (cumul/total >= thresh) return (i+1) + ' 個';
    }
    return lams.length + ' 個';
  },
  // F1 from confusion
  q_n8_001: (c) => {
    const tp=+c.tp, fp=+c.fp, fn=+c.fn;
    const p = tp/(tp+fp), r = tp/(tp+fn);
    return 2*p*r/(p+r);
  },
  // Recall
  q_n8_002: (c) => {
    const tp=+c.tp, fn=+c.fn;
    return tp/(tp+fn);
  },
  // Precision
  q_n8_003: (c) => {
    const tp=+c.tp, fp=+c.fp;
    return tp/(tp+fp);
  },
  // F1 from P,R
  q_n8_004: (c) => {
    const p=+c.p, r=+c.r;
    return 2*p*r/(p+r);
  },
  // Accuracy
  q_n8_005: (c) => {
    const tp=+c.tp, fp=+c.fp, fn=+c.fn, tn=+c.tn;
    return (tp+tn)/(tp+fp+fn+tn);
  },
  // F1
  q_pc_calc_001: (c) => {
    const tp=+c.tp, fp=+c.fp, fn=+c.fn;
    const p = tp/(tp+fp), r = tp/(tp+fn);
    return 2*p*r/(p+r);
  },
  // Lift
  q_pc_calc_002: (c) => {
    const pa=+c.pa, pb=+c.pb, pab=+c.pab;
    return pab / (pa*pb);
  },
  // ROI = (gain - cost)/cost (returns "NN%" string)
  q_pc_calc_003: (c) => {
    const cost=+c.cost, gain=+c.gain;
    return Math.round((gain - cost)/cost*100) + '%';
  },
  // MCC — fraud detection
  q_pg_007: (c) => {
    const tp=+c.tp, fp=+c.fp, fn=+c.fn, tn=+c.tn;
    const num = tp*tn - fp*fn;
    const den = Math.sqrt((tp+fp)*(tp+fn)*(tn+fp)*(tn+fn));
    return num/den;
  },
  // Sample variance with Bessel's correction (n-1 denominator) — L22101 descriptive stats
  q_n9_006: (c) => {
    const xs = [+c.x1, +c.x2, +c.x3, +c.x4, +c.x5];
    const n = xs.length;
    const mean = xs.reduce((s,x)=>s+x,0) / n;
    const ssd = xs.reduce((s,x)=>s+(x-mean)**2, 0);
    return ssd / (n - 1);
  },
  // Upper whisker via 1.5×IQR rule — L22101 outlier detection
  q_n9_015: (c) => {
    const q1=+c.q1, q3=+c.q3;
    const iqr = q3 - q1;
    return q3 + 1.5 * iqr;
  },
  // Z-score — L22102 normal distribution
  q_n10_006: (c) => {
    return (+c.x - +c.mu) / +c.sigma;
  },
  // Poisson PMF — L22102
  q_n10_013: (c) => {
    const lam = +c.lam, k = +c.k;
    const fact = (n) => n <= 1 ? 1 : n * fact(n - 1);
    return Math.exp(-lam) * Math.pow(lam, k) / fact(k);
  },
  // 95% CI upper bound — L22103
  q_n11_014: (c) => {
    return +c.mean + 1.96 * (+c.sigma) / Math.sqrt(+c.n);
  },
  // Bonferroni-corrected alpha — L22103 (alpha hard-coded 0.05)
  q_n11_019: (c) => {
    return 0.05 / +c.m;
  },
  // Missing rate % — L22201 (answer formatted as "NN.NN%")
  q_n12_007: (c) => {
    const pct = (+c.M) / (+c.N) * 100;
    return pct.toFixed(2) + '%';
  },
  // Standard error of sample proportion — L22301
  q_n15_020: (c) => {
    const p = +c.p, n = +c.n;
    return Math.sqrt(p * (1 - p) / n);
  },
  // Association-rule confidence — L22302
  q_n16_006: (c) => {
    return (+c.nAB) / (+c.nA);
  },
  // Markov chain 2-state steady-state πA — L22302
  q_n16_011: (c) => {
    return (+c.psa) / ((+c.pas) + (+c.psa));
  },
  // Inverse-frequency class weight ratio — L22401
  q_n18_015: (c) => {
    return (+c.neg) / (+c.pos);
  },
  // val count @ 7:1.5:1.5 split — L22401
  q_n18_019: (c) => {
    return Math.round((+c.N) * 0.15);
  },
  // Precision@K — L22402 (hit / K)
  q_n19_016: (c) => {
    return (+c.hit) / (+c.k);
  },
  // Majority-class accuracy (predict-all-negative) — L22402
  q_n19_019: (c) => {
    const total = +c.total, pos = +c.pos;
    return (total - pos) / total;
  },
  // Token count from GB / bytes-per-token (returns billion-tokens) — L22403
  q_n20_003: (c) => {
    return (+c.gb) / (+c.bpt);
  },
  // k-anonymity (minimum group size) — L22404
  q_n21_013: (c) => {
    return Math.min(+c.x_size, +c.y_size, +c.z_size);
  },
};

const questions = [
  ['questions-batch-n2-cv.json','q_n2_cv_005'],
  ['questions-batch-n2-cv.json','q_n2_cv_015'],
  ['questions-batch-n5-deploy.json','q_n5_018'],
  ['questions-batch-n5-deploy.json','q_n5_024'],
  ['questions-batch-n6-ml-core.json','q_n6_002'],
  ['questions-batch-n6-ml-core.json','q_n6_012'],
  ['questions-batch-n6-ml-core.json','q_n6_017'],
  ['questions-batch-n6-ml-core.json','q_n6_021'],
  ['questions-batch-n7-dl.json','q_n7_dl_019'],
  ['questions-batch-n8-eval-gov.json','q_n8_001'],
  ['questions-batch-n8-eval-gov.json','q_n8_002'],
  ['questions-batch-n8-eval-gov.json','q_n8_003'],
  ['questions-batch-n8-eval-gov.json','q_n8_004'],
  ['questions-batch-n8-eval-gov.json','q_n8_005'],
  ['questions-pc-modes.json','q_pc_calc_001'],
  ['questions-pc-modes.json','q_pc_calc_002'],
  ['questions-pc-modes.json','q_pc_calc_003'],
  ['questions-pg-eval.json','q_pg_007'],
  ['questions.json','q_0006'],
  ['questions-batch-n9-subject2.json','q_n9_006'],
  ['questions-batch-n9-subject2.json','q_n9_015'],
  ['questions-batch-n10-L22102.json','q_n10_006'],
  ['questions-batch-n10-L22102.json','q_n10_013'],
  ['questions-batch-n11-L22103.json','q_n11_014'],
  ['questions-batch-n11-L22103.json','q_n11_019'],
  ['questions-batch-n12-L22201.json','q_n12_007'],
  ['questions-batch-n15-L22301.json','q_n15_020'],
  ['questions-batch-n16-L22302.json','q_n16_006'],
  ['questions-batch-n16-L22302.json','q_n16_011'],
  ['questions-batch-n18-L22401.json','q_n18_015'],
  ['questions-batch-n18-L22401.json','q_n18_019'],
  ['questions-batch-n19-L22402.json','q_n19_016'],
  ['questions-batch-n19-L22402.json','q_n19_019'],
  ['questions-batch-n20-L22403.json','q_n20_003'],
  ['questions-batch-n21-L22404.json','q_n21_013'],
];

const findings = [];

questions.forEach(([f,id])=>{
  const q = getQuestion(f,id);
  const cases = Object.entries(q.stem_variables).filter(([k])=>k.startsWith('case_'));
  const verifier = verifiers[id];
  if (!verifier) { findings.push({id, status:'NO_VERIFIER'}); return; }
  cases.forEach(([k,v])=>{
    const expected = String(v.answer);
    let computed;
    try { computed = verifier(v); }
    catch(e) { findings.push({id, case:k, status:'VERIFIER_ERROR', err: e.message}); return; }
    // detect format from expected: count decimals
    const dot = expected.indexOf('.');
    const decs = dot >= 0 ? expected.length - dot - 1 : 0;
    const computedStr = (typeof computed === 'number') ? computed.toFixed(decs) : String(computed);
    if (computedStr === expected) {
      findings.push({id, case:k, status:'OK', expected, computed: computedStr});
    } else {
      findings.push({id, case:k, status:'MISMATCH', expected, computed: computedStr, raw: typeof computed === 'number' ? computed : String(computed), vars: v});
    }
  });
});

console.log(JSON.stringify(findings, null, 2));
