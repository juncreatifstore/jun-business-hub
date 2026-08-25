import "server-only";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS=[
 "a","abbr","address","article","b","blockquote","br","caption","center","code","col","colgroup","dd","del","div","dl","dt","em","font","h1","h2","h3","h4","h5","h6","hr","i","img","ins","li","ol","p","pre","s","section","small","span","strong","sub","sup","table","tbody","td","tfoot","th","thead","tr","u","ul"
];

const COMMON=["class","id","title","align","valign","width","height","bgcolor","color","dir","lang","role"];

export function sanitizeEmailHtml(input:string):string{
 if(!input.trim())return "";
 return sanitizeHtml(input,{
  allowedTags:ALLOWED_TAGS,
  allowedAttributes:{
   "*":COMMON.concat(["style"]),
   a:[...COMMON,"style","href","target","rel","name"],
   img:[...COMMON,"style","src","alt","border","hspace","vspace"],
   table:[...COMMON,"style","cellpadding","cellspacing","border","summary"],
   td:[...COMMON,"style","colspan","rowspan","nowrap"],
   th:[...COMMON,"style","colspan","rowspan","nowrap"],
   col:[...COMMON,"style","span"],
   colgroup:[...COMMON,"style","span"],
  },
  allowedSchemes:["http","https","mailto","tel"],
  allowedSchemesByTag:{img:["http","https"]},
  allowProtocolRelative:true,
  allowedStyles:{
   "*":{
    "background":[/^[-#(),.%\w\s\/:'\"]+$/],
    "background-color":[/^[-#(),.%\w\s]+$/],
    "border":[/^[-#(),.%\w\s]+$/],
    "border-bottom":[/^[-#(),.%\w\s]+$/],
    "border-left":[/^[-#(),.%\w\s]+$/],
    "border-right":[/^[-#(),.%\w\s]+$/],
    "border-top":[/^[-#(),.%\w\s]+$/],
    "border-collapse":[/^(collapse|separate)$/],
    "border-radius":[/^[-.%\d\s]+$/],
    "color":[/^[-#(),.%\w\s]+$/],
    "display":[/^(block|inline|inline-block|table|table-row|table-cell|none)$/],
    "font":[/^[-,.'\"%\w\s\/]+$/],
    "font-family":[/^[-,.'\"\w\s]+$/],
    "font-size":[/^[-.%\d\w]+$/],
    "font-style":[/^(normal|italic|oblique)$/],
    "font-weight":[/^(normal|bold|bolder|lighter|[1-9]00)$/],
    "height":[/^[-.%\d\w]+$/],
    "letter-spacing":[/^[-.%\d\w]+$/],
    "line-height":[/^[-.%\d\w]+$/],
    "margin":[/^[-.%\d\w\s]+$/],
    "margin-bottom":[/^[-.%\d\w]+$/],
    "margin-left":[/^[-.%\d\w]+$/],
    "margin-right":[/^[-.%\d\w]+$/],
    "margin-top":[/^[-.%\d\w]+$/],
    "max-width":[/^[-.%\d\w]+$/],
    "min-width":[/^[-.%\d\w]+$/],
    "padding":[/^[-.%\d\w\s]+$/],
    "padding-bottom":[/^[-.%\d\w]+$/],
    "padding-left":[/^[-.%\d\w]+$/],
    "padding-right":[/^[-.%\d\w]+$/],
    "padding-top":[/^[-.%\d\w]+$/],
    "text-align":[/^(left|right|center|justify|start|end)$/],
    "text-decoration":[/^[-\w\s]+$/],
    "vertical-align":[/^[-.%\d\w]+$/],
    "white-space":[/^(normal|nowrap|pre|pre-wrap)$/],
    "width":[/^[-.%\d\w]+$/],
   }
  },
  transformTags:{
   a:(tagName,attribs)=>({tagName,attribs:{...attribs,target:"_blank",rel:"noopener noreferrer nofollow"}}),
  },
  disallowedTagsMode:"discard",
  enforceHtmlBoundary:true,
 });
}
