import * as XLSX from "xlsx";

import { describe, expect, it } from "vitest";

import { parseHistoryXhsWorkbook } from "./history-xhs-service";

function createWorkbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx"
  }) as Buffer;
}

describe("history xiaohongshu workbook import", () => {
  it("imports the exported note detail workbook format", () => {
    const buffer = createWorkbookBuffer([
      Array.from({ length: 13 }, () => "最多导出排序后前1000条笔记"),
      ["笔记标题", "首次发布时间", "体裁", "曝光", "观看量", "封面点击率", "点赞", "评论", "收藏", "涨粉", "分享", "人均观看时长", "弹幕"],
      ["改变西汉历史的8位关键人物", "2026年06月25日12时01分35秒", "图文", 0, 6, 0, 0, 0, 0, 0, 0, 0, 0],
      ["东汉皇帝图鉴", "2026年06月23日12时39分23秒", "图文", 292, 32, 0.106, 4, 0, 1, 0, 2, 36, 0]
    ]);

    const state = parseHistoryXhsWorkbook(buffer, "笔记列表明细表.xlsx");

    expect(state.status).toBe("idle");
    expect(state.sourceUrl).toBe("笔记列表明细表.xlsx");
    expect(state.posts).toHaveLength(2);
    expect(state.posts[0]).toMatchObject({
      title: "改变西汉历史的8位关键人物",
      views: 6,
      likes: 0,
      collects: 0,
      comments: 0,
      shares: 0
    });
    expect(state.posts[1]).toMatchObject({
      title: "东汉皇帝图鉴",
      views: 32,
      likes: 4,
      collects: 1,
      comments: 0,
      shares: 2
    });
    expect(state.overview).toMatchObject({
      postCount: 2,
      totalViews: 38,
      totalLikes: 4,
      totalCollects: 1,
      totalComments: 0,
      totalShares: 2
    });
  });

  it("returns a clear failure when the workbook has no note title header", () => {
    const buffer = createWorkbookBuffer([
      ["标题", "观看量"],
      ["示例", 100]
    ]);

    const state = parseHistoryXhsWorkbook(buffer, "bad.xlsx");

    expect(state.status).toBe("failed");
    expect(state.lastError).toContain("笔记标题");
  });
});
