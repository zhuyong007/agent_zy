function money(value) {
  const numberValue = Number(value || 0);
  return numberValue.toFixed(2);
}

function integer(value) {
  return String(Math.round(Number(value || 0)));
}

function dateOnly(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function compactText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback || "-";
}

function splitList(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = {
  money,
  integer,
  dateOnly,
  today,
  compactText,
  splitList
};
