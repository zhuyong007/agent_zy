import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { CommandRail, useHomeLayoutPreferences, useLiveClock, useThemePreference } from "./dashboard-page";

export function ToolsBackLink() {
  return (
    <a className="tools-back-link" data-action="back-to-tools" href="/tools">
      返回上级
    </a>
  );
}

export function ToolsCatalog() {
  return (
    <section className="tools-shell">
      <header className="tools-page-header">
        <div>
          <p className="eyebrow">Local Utilities</p>
          <h1>工具</h1>
          <p>把常用的本机小工具集中放在这里。每个工具都有独立页面，后续可以持续扩展。</p>
        </div>
      </header>
      <div className="tools-catalog">
        <Link className="tools-card" to="/tools/photo-renamer">
          <span className="tools-card__index">01</span>
          <h2>照片和视频名称修改</h2>
          <p>递归扫描媒体目录，根据拍摄或创建时间预览并批量修改文件名。</p>
          <strong>打开工具</strong>
        </Link>
        <Link className="tools-card" to="/tools/browser-automation">
          <span className="tools-card__index">02</span>
          <h2>浏览器自动化</h2>
          <p>创建 Chrome 操作流程，按页面状态等待、判断并执行后续步骤。</p>
          <strong>打开工具</strong>
        </Link>
        <Link className="tools-card" to="/tools/prompt-templates">
          <span className="tools-card__index">03</span>
          <h2>提示词模版</h2>
          <p>保存优秀提示词，提炼可替换内容，并按新需求生成最终提示词。</p>
          <strong>打开工具</strong>
        </Link>
        <Link className="tools-card" to="/tools/file-organizer">
          <span className="tools-card__index">04</span>
          <h2>文件整理</h2>
          <p>递归扫描本机文件夹，按时间或类型预览并移动文件。</p>
          <strong>打开工具</strong>
        </Link>
        <Link className="tools-card" to="/tools/child-meal">
          <span className="tools-card__index">05</span>
          <h2>孩子食谱</h2>
          <p>记录孩子每日饮食，结合月龄、季节食材和长期历史规划未来食谱。</p>
          <strong>打开工具</strong>
        </Link>
        <Link className="tools-card" to="/tools/screen-monitor">
          <span className="tools-card__index">06</span>
          <h2>屏幕监控</h2>
          <p>定时理解当前屏幕内容，提取结果，并在变化时用系统语音播报。</p>
          <strong>打开工具</strong>
        </Link>
      </div>
    </section>
  );
}

export function ToolsPage() {
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const { layout } = useHomeLayoutPreferences();

  return (
    <main className="workspace tools-workspace">
      <CommandRail
        activeSection="tools"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        clockLine={clockLine}
        navigationLayout={layout}
        rightMeta={[]}
      />
      <ToolsCatalog />
    </main>
  );
}
