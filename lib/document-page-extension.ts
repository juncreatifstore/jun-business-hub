import { Node, mergeAttributes } from "@tiptap/core";

export const JunPageMarker = Node.create({
  name: "junPageMarker",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      pageId: { default: "" },
      rotation: { default: 0 },
    };
  },
  parseHTML() {
    return [{
      tag: 'div[data-jun-page="true"]',
      getAttrs: (element) => {
        const el = element as HTMLElement;
        const rotation = Number(el.getAttribute("data-rotation") || 0);
        return {
          pageId: el.getAttribute("data-page-id") || "",
          rotation: [0, 90, 180, 270].includes(rotation) ? rotation : 0,
        };
      },
    }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, {
      "data-jun-page": "true",
      "data-page-id": String(node.attrs.pageId || ""),
      "data-rotation": String(node.attrs.rotation || 0),
      contenteditable: "false",
      style: "height:0;border:0;margin:0;padding:0;overflow:hidden",
      "aria-hidden": "true",
    })];
  },
});
