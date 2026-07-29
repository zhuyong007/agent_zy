const { getApiBase } = require("../config");

function readErrorMessage(data, fallback) {
  if (data && typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }

  return fallback;
}

function request(path, options) {
  const opts = options || {};

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getApiBase()}${path}`,
      method: opts.method || "GET",
      data: opts.data,
      header: Object.assign(
        {
          "Content-Type": "application/json"
        },
        opts.header || {}
      ),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        reject(new Error(readErrorMessage(res.data, `请求失败：${res.statusCode}`)));
      },
      fail(error) {
        reject(new Error(error.errMsg || "网络请求失败"));
      }
    });
  });
}

function pathId(id) {
  return encodeURIComponent(String(id));
}

const api = {
  health() {
    return request("/api/health");
  },

  dashboard() {
    return request("/api/dashboard");
  },

  mhxy() {
    return request("/api/mhxy");
  },

  createMhxyTrade(input) {
    return request("/api/mhxy/trades", {
      method: "POST",
      data: input
    });
  },

  deleteMhxyTrade(id) {
    return request(`/api/mhxy/trades/${pathId(id)}`, {
      method: "DELETE"
    });
  },

  createMhxyAssetFlip(input) {
    return request("/api/mhxy/asset-flips", {
      method: "POST",
      data: input
    });
  },

  deleteMhxyAssetFlip(id) {
    return request(`/api/mhxy/asset-flips/${pathId(id)}`, {
      method: "DELETE"
    });
  },

  childMealOverview() {
    return request("/api/tools/child-meal/overview");
  },

  createChildMealRecord(input) {
    return request("/api/tools/child-meal/records", {
      method: "POST",
      data: input
    });
  },

  createChildMealNote(input) {
    return request("/api/tools/child-meal/notes", {
      method: "POST",
      data: input
    });
  },

  generateChildMealPlan(input) {
    return request("/api/tools/child-meal/generate-plan", {
      method: "POST",
      data: input
    });
  },

  saveChildMealPlan(input) {
    return request("/api/tools/child-meal/save-plan", {
      method: "POST",
      data: input
    });
  }
};

module.exports = {
  request,
  api
};
