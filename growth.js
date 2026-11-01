// Referenzwerte: WHO Child Growth Standards, Mädchen (0 bis 24 Monate), Gewicht-für-Alter und Länge-für-Alter.
// Quelle: https://www.who.int/tools/child-growth-standards/standards (Tabellen tab_wfa_girls_p_0_5 und tab_lhfa_girls_p_0_2).
// Je Monat die LMS-Parameter [L, M, S]; daraus werden Perzentilkurven und das Perzentil einer Messung berechnet.
// Diese WHO-Standards liegen auch den Perzentilkurven in den deutschen Kinder-Vorsorgeheften zugrunde.
const WHO_GIRLS = {
  weight: [
    [0.3809, 3.2322, 0.14171],
    [0.1714, 4.1873, 0.13724],
    [0.0962, 5.1282, 0.13],
    [0.0402, 5.8458, 0.12619],
    [-0.005, 6.4237, 0.12402],
    [-0.043, 6.8985, 0.12274],
    [-0.0756, 7.297, 0.12204],
    [-0.1039, 7.6422, 0.12178],
    [-0.1288, 7.9487, 0.12181],
    [-0.1507, 8.2254, 0.12199],
    [-0.17, 8.48, 0.12223],
    [-0.1872, 8.7192, 0.12247],
    [-0.2024, 8.9481, 0.12268],
    [-0.2158, 9.1699, 0.12283],
    [-0.2278, 9.387, 0.12294],
    [-0.2384, 9.6008, 0.12299],
    [-0.2478, 9.8124, 0.12303],
    [-0.2562, 10.0226, 0.12306],
    [-0.2637, 10.2315, 0.12309],
    [-0.2703, 10.4393, 0.12315],
    [-0.2762, 10.6464, 0.12323],
    [-0.2815, 10.8534, 0.12335],
    [-0.2862, 11.0608, 0.1235],
    [-0.2903, 11.2688, 0.12369],
    [-0.2941, 11.4775, 0.1239]
  ],
  length: [
    [1.0, 49.1477, 0.0379],
    [1.0, 53.6872, 0.0364],
    [1.0, 57.0673, 0.03568],
    [1.0, 59.8029, 0.0352],
    [1.0, 62.0899, 0.03486],
    [1.0, 64.0301, 0.03463],
    [1.0, 65.7311, 0.03448],
    [1.0, 67.2873, 0.03441],
    [1.0, 68.7498, 0.0344],
    [1.0, 70.1435, 0.03444],
    [1.0, 71.4818, 0.03452],
    [1.0, 72.771, 0.03464],
    [1.0, 74.015, 0.03479],
    [1.0, 75.2176, 0.03496],
    [1.0, 76.3817, 0.03514],
    [1.0, 77.5099, 0.03534],
    [1.0, 78.6055, 0.03555],
    [1.0, 79.671, 0.03576],
    [1.0, 80.7079, 0.03598],
    [1.0, 81.7182, 0.0362],
    [1.0, 82.7036, 0.03643],
    [1.0, 83.6654, 0.03666],
    [1.0, 84.604, 0.03688],
    [1.0, 85.5202, 0.03711],
    [1.0, 86.4153, 0.03734]
  ],
};

// z-Werte der Perzentile 3, 15, 50, 85, 97 (wie auf den WHO-Kurvenblättern)
const WHO_PERCENTILES = [[3, -1.8808], [15, -1.0364], [50, 0], [85, 1.0364], [97, 1.8808]];

// LMS für ein (auch gebrochenes) Alter in Monaten, linear zwischen den Monatswerten
function whoLms(kind, month) {
  const t = WHO_GIRLS[kind], m = Math.min(Math.max(month, 0), 24), i = Math.min(Math.floor(m), 23), f = m - i;
  return t[i].map((v, k) => v + (t[i + 1][k] - v) * f);
}
// Wert (kg bzw. cm) auf der Kurve mit dem z-Wert z
function whoValue(kind, month, z) {
  const [L, M, S] = whoLms(kind, month);
  return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}
// Perzentil (0 bis 100) einer Messung
function whoPercentile(kind, month, x) {
  const [L, M, S] = whoLms(kind, month);
  const z = L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
  // Standardnormalverteilung (Näherung nach Abramowitz/Stegun 26.2.17, Fehler < 1e-7)
  const a = Math.abs(z), t = 1 / (1 + 0.2316419 * a);
  const d = 0.3989423 * Math.exp(-a * a / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 100 * (z > 0 ? 1 - p : p);
}
