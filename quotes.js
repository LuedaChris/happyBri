// Tagesspruch (Goal 16): ein aufmunternder Satz pro Tag, auf beiden Handys derselbe.
// Der Spruch ergibt sich aus dem Datum (Tageswechsel 04:00), es wird nichts gespeichert. Die Liste wird der Reihe nach
// durchlaufen, ein Spruch kommt also erst nach QUOTES.length Tagen wieder (mindestens 31, damit es frühestens nach einem Monat ist).
const QUOTES = [
  'Du machst das gut – auch wenn es sich nicht immer so anfühlt.',
  'Ein müder Elternteil ist ein liebender Elternteil.',
  'Kein Tag ist wie der andere – und ihr meistert jeden.',
  'Bri braucht keine perfekten Eltern, sondern euch.',
  'Heute reicht „gut genug“.',
  'Jede Nacht geht vorbei – auch diese.',
  'Ihr seid ein starkes Team.',
  'Kleine Schritte zählen: Heute habt ihr schon viele geschafft.',
  'Bri spürt vor allem eins: dass ihr da seid.',
  'Pausen sind kein Luxus, sondern Teil des Jobs.',
  'Fragen zu haben heißt nicht, es falsch zu machen.',
  'Ihr lernt gemeinsam – Bri und ihr.',
  'Auch Chaos ist ein Zeichen von Leben.',
  'Ein Lächeln von Bri macht vieles wieder gut.',
  'Du musst nicht alles wissen, nur weitermachen.',
  'Jede Familie hat ihren eigenen Rhythmus – vergleichen lohnt nicht.',
  'Atme tief durch – du bist genau richtig für Bri.',
  'Schon etwas für dich getan? Fünf Minuten zählen.',
  'Auch mit Augenringen seid ihr Helden.',
  'Was heute nicht klappt, klappt morgen vielleicht von selbst.',
  'Mit jedem Arm, der sie hält, gebt ihr Bri Sicherheit.',
  'Hilfe anzunehmen ist Stärke.',
  'Die Tage sind lang, die Jahre kurz.',
  'Ihr braucht keinen perfekten Plan, nur etwas Geduld mit euch selbst.',
  'Jede Windel, jede Flasche, jede Umarmung zählt.',
  'Sei nett zu dir – du gibst gerade viel.',
  'Heute ist ein neuer Anfang, egal wie die Nacht war.',
  'Bri wächst – und ihr wachst mit.',
  'Gemeinsam durch die Nacht ist halb so schwer.',
  'Ein Moment Ruhe ist auch ein Erfolg.',
  'Für Bri seid ihr die ganze Welt.',
  'Es ist okay, wenn es mal nicht okay ist.',
  'Ihr macht mehr richtig, als ihr denkt.',
  'Vertraut eurem Bauchgefühl – ihr kennt Bri am besten.',
  'Dranbleiben, durchatmen, weiterlieben.',
];

function quoteOfDay(now = new Date()) {
  const d = new Date(now.getTime() - 4 * 3600e3); // vor 04:00 gilt noch der Spruch von gestern
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  return QUOTES[day % QUOTES.length];
}

function renderQuote() { $('#quote').textContent = quoteOfDay(); }
