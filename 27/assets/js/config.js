/* 站点级配置，与内容数据分开，重新生成 content/data.js 不会覆盖这里。
 *
 * externalLinks：顶栏右上角的工具入口，渲染为 new tab 链接。
 *   label  长标签（桌面显示）
 *   short  短标签（窄屏显示，可省略）
 *   href   相对本站的路径或完整 URL
 *   title  鼠标悬停提示（可省略）
 *
 * 不需要就设为空数组 []，按钮会自动隐藏。
 *
 * shelfBooks：首页书架上的其他版本卡片（显示在当前书下方）。
 * 根目录总入口已单独列出 26 版，这里留空，27 书架只展示本版。
 */
window.YIYEZHI_CONFIG = {
  externalLinks: [
    {
      label: "史纲时间轴",
      short: "时间轴",
      href: "../../史纲时间轴.html",
      title: "打开本地的史纲时间轴"
    },
    {
      label: "真正的一页纸",
      short: "一页纸",
      href: "../../真正的一页纸.html",
      title: "打开本地的真正的一页纸"
    }
  ],
  shelfBooks: []
};
