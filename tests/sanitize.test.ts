import { describe, it, expect } from "vitest";
import { sanitizeDocumentHtml, htmlToText } from "@/lib/sanitize";

describe("HTML sanitization — stored XSS prevention", () => {
  it("strips <script> entirely", () => {
    const out = sanitizeDocumentHtml('<p>hi</p><script>alert("xss")</script>');
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert");
    expect(out).toContain("<p>hi</p>");
  });

  it("strips iframe, object, embed", () => {
    const out = sanitizeDocumentHtml('<iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x">');
    expect(out).not.toMatch(/iframe|object|embed/);
  });

  it("removes event handlers (onerror, onclick, onload…)", () => {
    const out = sanitizeDocumentHtml('<p onclick="steal()">x</p><div onmouseover="p()">y</div>');
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onmouseover");
    expect(out).toContain(">x</p>");
  });

  it("blocks javascript: and data: URLs in links", () => {
    const out = sanitizeDocumentHtml('<a href="javascript:alert(1)">j</a><a href="data:text/html,x">d</a><a href="https://ok.example">ok</a>');
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("data:text");
    expect(out).toContain('href="https://ok.example"');
  });

  it("forces rel=noopener on links", () => {
    const out = sanitizeDocumentHtml('<a href="https://x.example">l</a>');
    expect(out).toContain("noopener");
    expect(out).toContain("noreferrer");
  });

  it("keeps legitimate document structure", () => {
    const src = "<h1>Contract</h1><h2>Scope</h2><p><strong>Bold</strong> <em>it</em> <u>u</u></p><ul><li>a</li></ul><ol><li>b</li></ol><blockquote>q</blockquote><table><tbody><tr><td>c</td></tr></tbody></table>";
    const out = sanitizeDocumentHtml(src);
    for (const tag of ["<h1>", "<h2>", "<strong>", "<em>", "<u>", "<ul>", "<ol>", "<blockquote>", "<table>", "<td>"]) {
      expect(out).toContain(tag);
    }
  });

  it("allows only text-align in style, strips the rest", () => {
    const out = sanitizeDocumentHtml('<p style="text-align: center; position:fixed; background:url(javascript:x)">c</p>');
    expect(out).toContain("text-align");
    expect(out).not.toContain("position");
    expect(out).not.toContain("url(");
  });

  it("survives nested/malformed payloads", () => {
    const out = sanitizeDocumentHtml('<p><scr<script>ipt>alert(1)</scr</script>ipt></p><img src=x onerror=alert(1)>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("alert(1)</scr");
  });

  it("htmlToText flattens to plain text (AI minimization)", () => {
    expect(htmlToText("<h1>Hello</h1><p><b>world</b></p><script>x()</script>")).not.toContain("<");
    expect(htmlToText("<p>a</p>")).toBe("a");
  });
});
