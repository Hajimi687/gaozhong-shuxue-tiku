// Mathematical content only; titles, dates, question numbers and UI metadata
// do not pass through this formatter. Archived source fields remain unchanged.
const protectedPattern=/(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$|(?<![\\$])\$(?!\$)[^$]*?(?<!\\)\$(?!\$)|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}|(?:https?:\/\/|www\.)[^\s]+|(?:^|\n)[ \t]*[（(]\d+[）)]|(?<=[\]】};；])[ \t]*[（(]\d+[）)]|(?:^|\n)[ \t]*\d+[.．、](?!\d)(?=[ \t]|[\u3400-\u9fff])|第\s*(?:\d+|[（(]\d+[）)])\s*(?:小题|题|问)|解法\s*\d+|满分\s*\d+(?:\.\d+)?\s*分|本题共有\s*\d+\s*个小题|同\s*[（(]\d+[）)]|[（(]\d+[）)](?=\s*应当作为特例)/g;
const numberPattern=/(?:(?<![A-Za-z\d_\\.])|(?<=[\u3400-\u9fff]\.))[+\-−]?\d+(?:\.\d+)?(?:\s*\/\s*[+\-−]?\d+(?:\.\d+)?)?(?:[%％])?(?!(?:[A-Za-z\d_]|\.\d))/g;

function groupEnd(text,start){
 let depth=1;
 for(let i=start+1;i<text.length;i++){
  if(text[i]==='\\'){i++;continue;}
  if(text[i]==='{')depth++;else if(text[i]==='}'&&!--depth)return i+1;
 }
 return text.length;
}

function numbersInProse(text){
 // Preserve command syntax and its arguments, e.g. \hspace{2em},
 // \dfrac{1}{2}, and table column widths. Styled prose is processed by
 // the existing text-structure renderer, rather than inserting $ into syntax.
 let result='',end=0;
 for(let at=0;at<text.length;at++){
  if(text[at]!=='\\')continue;
  const command=text.slice(at).match(/^\\(?:[A-Za-z]+\*?|.)/)[0];
  let stop=at+command.length;
  for(;;){
   const next=text.slice(stop).match(/^\s*/)[0].length+stop;
   if(text[next]==='{'){stop=groupEnd(text,next);continue;}
   if(text[next]==='['){const close=text.indexOf(']',next);if(close>=0){stop=close+1;continue;}}
   break;
  }
  let preserved=text.slice(at,stop);
  if(/^\\(?:textbf|textit|emph)\*?$/.test(command)){
   const start=text.indexOf('{',at+command.length);
   if(start>=0&&start<stop){
    const close=groupEnd(text,start);
    preserved=text.slice(at,start+1)+typesetMathNumbers(text.slice(start+1,close-1))+text.slice(close-1,stop);
   }
  }
  result+=wrapNumbers(text.slice(end,at))+preserved;end=stop;at=stop-1;
 }
 return result+wrapNumbers(text.slice(end));
}

function wrapNumbers(text){
 return text.replace(numberPattern,number=>{
  const fraction=number.match(/^([+\-−]?\d+(?:\.\d+)?)\s*\/\s*([+\-−]?\d+(?:\.\d+)?)$/);
  return fraction?`$\\dfrac{${fraction[1]}}{${fraction[2]}}$`:`$${number.replace(/[％%]/g,'\\%').replace(/−/g,'-')}$`;
 });
}

export function typesetMathNumbers(value){
 // Scores and references to numbered subquestions are layout metadata, even
 // when an earlier formatter incorrectly wrapped their digits in math mode.
 const text=String(value??'')
  .replace(/(满分\s*)\$(\d+(?:\.\d+)?)\$(\s*分)/g,'$1$2$3')
  .replace(/(本题共有\s*)\$(\d+)\$(\s*个小题)/g,'$1$2$3')
  .replace(/(第\s*)\$(\d+)\$(\s*(?:小题|题|问))/g,'$1$2$3')
  .replace(/((?:^|\n|[;；\]】}])[ \t]*[（(])\$(\d+)\$([）)])/g,'$1$2$3')
  .replace(/(同\s*[（(])\$(\d+)\$([）)])/g,'$1$2$3')
  .replace(/([（(])\$(\d+)\$([）)]\s*应当作为特例)/g,'$1$2$3');
 let result='',end=0;
 if(/^[+\-]?\.\d+(?:[%％])?$/.test(text.trim()))return `$${text.trim().replace(/[％%]/g,'\\%')}$`;
 if(/^[\d+\-−*/^=<>≤≥×÷().%％\s]+$/.test(text.trim())&&/[+\-−*/^=<>≤≥×÷]/.test(text)&&/\d/.test(text)){
  const formula=text.trim().replace(/(\d+(?:\.\d+)?)\s*\/\s*([+\-]?\d+(?:\.\d+)?)/g,'\\dfrac{$1}{$2}')
   .replace(/[％%]/g,'\\%').replace(/−/g,'-').replace(/×/g,'\\times ').replace(/÷/g,'\\div ');
  return `$${formula}$`;
 }
 // Protect an entire bare TeX formula before finding individual numbers.
 // Otherwise the 0 in (z,m)=\left(\frac12,0\right) could be wrapped alone.
 if(!/[\u3400-\u9fff$]|\\(?:begin|hspace|vspace|textbf|textit|emph)\b/.test(text)&&/\\(?:dfrac|frac|tfrac|sqrt|left|right|sum|prod|int|lim|cdot|times|vec|overrightarrow|pi|theta|alpha|beta|infty|pm|leq|geq|neq|perp|parallel)\b|\\(?:dfrac|frac|tfrac)(?=\d)/.test(text))return `$${text}$`;
 // A bare algebraic expression is one formula, not a series of text/number
 // fragments. Plain option letters such as an answer "B" stay textual.
 if(/^[a-zA-Z\d_+\-*=<>≤≥(),.^\s]+$/.test(text)&&/[=<>≤≥]/.test(text)&&/[a-zA-Z]/.test(text))return `$${text}$`;
 for(const token of text.matchAll(protectedPattern)){
  result+=numbersInProse(text.slice(end,token.index))+token[0];end=token.index+token[0].length;
 }
 return result+numbersInProse(text.slice(end));
}
