"use strict";
(() => {
  // src/client.ts
  var TAB_ID = "@dsh-plugin/dsh-git-sidebar";
  var TAB_KIND = "git-panel";
  var NS = "git-sidebar";
  var SOURCE = "@dsh-plugin/dsh-git-sidebar";
  var loader = globalThis.__ModuleLoader__;
  var DICTS = {
    zh: {
      "panel.label": "Git",
      "guide.title": "Git \u9762\u677F",
      "guide.description": "\u67E5\u770B\u5206\u652F\u3001\u5DE5\u4F5C\u533A\u72B6\u6001\u4E0E\u63D0\u4EA4",
      "panel.status": "\u4ED3\u5E93\u72B6\u6001\u5373\u5C06\u53EF\u7528",
      "panel.emptyBody": "\u8FD9\u4E2A\u9762\u677F\u5C06\u663E\u793A\u5F53\u524D\u4ED3\u5E93\u7684\u5206\u652F\u3001\u5DE5\u4F5C\u533A\u72B6\u6001\u4E0E\u6700\u8FD1\u63D0\u4EA4\u3002\u4ED3\u5E93\u8BFB\u53D6\u5C06\u5728\u540E\u7EED\u7248\u672C\u5B9E\u73B0\u3002"
    },
    en: {
      "panel.label": "Git",
      "guide.title": "Git panel",
      "guide.description": "Inspect branches, working-tree status and commits",
      "panel.status": "Repository status coming soon",
      "panel.emptyBody": "This panel will show the current repository branch, working-tree status, and recent commits. Repository inspection arrives in a later version."
    }
  };
  function GitGuideIcon(React) {
    return function GitGuideArtwork(props) {
      const size = props.size ?? 26;
      const ink = "#e5522f";
      return React.createElement(
        "svg",
        {
          viewBox: "0 0 36 36",
          width: size,
          height: size,
          className: props.className,
          "aria-hidden": true,
          style: { display: "block" }
        },
        // Main line.
        React.createElement("path", {
          d: "M13 9.7v16.6",
          stroke: ink,
          strokeWidth: 2.7,
          strokeLinecap: "round",
          fill: "none"
        }),
        // The branch leaves the upper-right commit and rejoins the main line.
        React.createElement("path", {
          d: "M23 9.7v5.4c0 3.3-2.5 5.8-6 5.8H13",
          stroke: ink,
          strokeWidth: 2.7,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          fill: "none"
        }),
        React.createElement("circle", { cx: 13, cy: 9.7, r: 2.7, fill: ink }),
        React.createElement("circle", { cx: 23, cy: 9.7, r: 2.7, fill: ink }),
        React.createElement("circle", { cx: 13, cy: 26.3, r: 2.7, fill: ink })
      );
    };
  }
  function GitPanel(React, t) {
    const outer = {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      padding: "20px",
      color: "var(--dsw-alias-label-primary)"
    };
    const statusStyle = { margin: 0, fontSize: "13px", fontWeight: 600 };
    const bodyStyle = {
      margin: 0,
      fontSize: "13px",
      lineHeight: 1.6,
      color: "var(--dsw-alias-label-secondary)"
    };
    return React.createElement(
      "section",
      { style: outer },
      React.createElement("p", { style: statusStyle }, t("panel.status")),
      React.createElement("p", { style: bodyStyle }, t("panel.emptyBody"))
    );
  }
  loader.load({
    id: SOURCE,
    factory(require2) {
      const React = require2("react");
      const GuideIcon = GitGuideIcon(React);
      return {
        inject: ["slots", "locale", "sidebarRightTabs"],
        apply(ctx) {
          ctx.effect(() => ctx.locale.register(NS, DICTS), "git-sidebar: dictionaries");
          const t = ctx.locale.bind(NS);
          ctx.effect(() => ctx.sidebarRightTabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            title: () => t("panel.label"),
            guide: [{
              id: "open",
              // Workspace files is 10 and Code review 15: 12 sits directly below
              // the first button.
              order: 12,
              title: () => t("guide.title"),
              description: () => t("guide.description"),
              icon: GuideIcon
            }]
          }), "git-sidebar: tab type");
          ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
            name: "sidebar.right.pane.tab",
            key: TAB_ID,
            locale: NS
          }, function GitPanelView() {
            return GitPanel(React, t);
          })), "git-sidebar: panel body");
        }
      };
    }
  });
})();
