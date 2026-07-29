const STORAGE_KEY = "agentzy_api_base";
const DEFAULT_API_BASE = "http://127.0.0.1:4378";

function normalizeApiBase(value) {
  const trimmed = String(value || "").trim();
  return trimmed.replace(/\/+$/, "");
}

function getApiBase() {
  return normalizeApiBase(wx.getStorageSync(STORAGE_KEY) || DEFAULT_API_BASE);
}

function setApiBase(value) {
  const normalized = normalizeApiBase(value);
  wx.setStorageSync(STORAGE_KEY, normalized || DEFAULT_API_BASE);
  return getApiBase();
}

function resetApiBase() {
  wx.removeStorageSync(STORAGE_KEY);
  return getApiBase();
}

module.exports = {
  DEFAULT_API_BASE,
  getApiBase,
  setApiBase,
  resetApiBase
};
