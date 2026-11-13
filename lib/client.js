"use strict";
(() => {
  // src/client.ts
  var PANEL_ID = "git";
  var NS = "git-sidebar";
  var SOURCE = "@dsh-plugin/dsh-git-sidebar";
  var loader = globalThis.__ModuleLoader__;
  var DICTS = {
    zh: {
      "panel.label": "Git",
      "panel.title": "Git",
      "panel.emptyTitle": "\u5C1A\u672A\u8BFB\u53D6\u4ED3\u5E93",
      "panel.emptyBody": "\u8FD9\u4E2A\u9762\u677F\u5C06\u663E\u793A\u4F1A\u8BDD\u5DE5\u4F5C\u533A\u6240\u5728\u4ED3\u5E93\u7684\u5206\u652F\u3001\u5DE5\u4F5C\u533A\u72B6\u6001\u4E0E\u6700\u8FD1\u63D0\u4EA4\u3002\u4ED3\u5E93\u8BFB\u53D6\u5C06\u5728\u540E\u7EED\u7248\u672C\u5B9E\u73B0\u3002"
    },
    en: {
      "panel.label": "Git",
      "panel.title": "Git",
      "panel.emptyTitle": "No repository yet",
      "panel.emptyBody": "This panel will show the branch, working-tree status, and recent commits of the session workspace. Repository inspection arrives in a later version."
    }
  };
  function GitPanelIcon(React, size, active) {
    return React.createElement(
      "svg",
      {
        viewBox: "0 0 36 36",
        width: size,
        height: size,
        "aria-hidden": true,
        style: { display: "block" }
      },
      React.createElement("path", {
        d: "M18 4.5v9M18 22.5v9",
        stroke: "currentColor",
        strokeWidth: 2.2,
        strokeLinecap: "round",
        fill: "none",
        opacity: active ? 1 : 0.9
      }),
      React.createElement("circle", { cx: 18, cy: 18, r: 5, fill: "none", stroke: "currentColor", strokeWidth: 2.2 }),
      React.createElement("circle", { cx: 18, cy: 18, r: 1.8, fill: "currentColor" })
    );
  }
  function GitPanel(React, t) {
    const style = {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      padding: "24px",
      color: "var(--dsw-alias-label-primary)"
    };
    const titleStyle = { margin: 0, fontSize: "15px", fontWeight: 600 };
    const textStyle = {
      margin: 0,
      fontSize: "13px",
      lineHeight: 1.6,
      color: "var(--dsw-alias-label-secondary)"
    };
    return function GitPanelView() {
      return React.createElement(
        "section",
        { style },
        React.createElement("h2", { style: titleStyle }, t("panel.title")),
        React.createElement("p", { style: { ...textStyle, color: "var(--dsw-alias-label-primary)" } }, t("panel.emptyTitle")),
        React.createElement("p", { style: textStyle }, t("panel.emptyBody"))
      );
    };
  }
  loader.load({
    id: SOURCE,
    factory(require2) {
      const React = require2("react");
      return {
        inject: ["slots", "locale"],
        apply(ctx) {
          ctx.effect(() => ctx.locale.register(NS, DICTS), "git-sidebar: dictionaries");
          const t = ctx.locale.bind(NS);
          ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
            name: "sidebar.panellist",
            id: PANEL_ID,
            order: 40,
            label: () => t("panel.label"),
            locale: NS
          }, (props) => GitPanelIcon(React, props.size, props.active))), "git-sidebar: sidebar row");
          ctx.effect(() => ctx.slots.inject("main", () => ctx.slots.register({
            name: "main",
            key: PANEL_ID,
            locale: NS
          }, GitPanel(React, t))), "git-sidebar: main panel");
        }
      };
    }
  });
})();
