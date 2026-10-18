// Output formatting only. Never alter archived question/reference text.
// Number domains use blackboard bold capitals in every display/export path.
// Keep an explicitly named set or matrix distinct from a number domain.
const letters = 'NQZRC';
const styled = /\\(mathbb|mathbf|mathrm|mathsf|mathit|boldsymbol)\s*(?:\{\s*([NQZRC])\s*\}|([NQZRC])(?![A-Za-z]))/g;
const doubleStruck = Object.freeze({'ℕ':'N','ℚ':'Q','ℤ':'Z','ℝ':'R','ℂ':'C'});

// Display prose and mathematics share ASCII punctuation, while TeX retains
// its own math-mode punctuation glyphs and spacing. Never rewrite a control
// symbol (\\, and \\; are spacing commands), a source identifier, or drawing.
const academicPunctuation = Object.freeze({ '、': ',', '，': ',', '。': '.', '．': '.',
  '；': ';', '：': ':', '！': '!', '？': '?', '（': '(', '）': ')',
  '【': '[', '】': ']', '“': '"', '”': '"', '‘': "'", '’': "'" });
const punctuationOpaqueArguments = new Set(['url','path','label','ref','eqref','pageref',
  'cite','citep','citet','includegraphics','input','include','bibliography','bibliographystyle','index','href']);
const punctuationTextArguments = new Set(['text','mbox','textbf','textit','textnormal','emph']);
const punctuationOpaqueEnvironments = new Set(['verbatim','Verbatim','lstlisting','minted','tikzpicture']);

function punctuationGroupEnd(text,start,open='{',close='}') {
  let depth=1;
  for(let at=start+1;at<text.length;at++) {
    if(text[at]==='\\'){at++;continue;}
    if(text[at]===open)depth++;
    else if(text[at]===close&&!--depth)return at+1;
  }
  return -1;
}

function punctuationSegment(text,math) {
  let output='';
  for(let at=0;at<text.length;) {
    // URL punctuation and TeX source keys are data, rather than sentence
    // punctuation. A display-only rule must not change where they point.
    const url=text.slice(at).match(/^(?:https?:\/\/|www\.)[^\s<>"$]+/);
    if(url){output+=url[0];at+=url[0].length;continue;}
    if(text[at]==='%') {
      const stop=text.indexOf('\n',at);
      output+=text.slice(at,stop<0?text.length:stop);at=stop<0?text.length:stop;continue;
    }
    if(text[at]==='\\') {
      const command=text.slice(at).match(/^\\(?:[A-Za-z]+|[^\r\n])/u)?.[0]||'\\';
      if(!math&&(command==='\\('||command==='\\[')) {
        const close=command==='\\('? '\\)': '\\]';
        let stop=at+2;
        for(;(stop=text.indexOf(close,stop))>=0&&text[stop-1]==='\\';stop+=2){}
        if(stop>=0){output+=command+punctuationSegment(text.slice(at+2,stop),true)+close;at=stop+2;continue;}
      }
      const name=command.slice(1);
      let after=at+command.length;
      if(name==='verb') {
        if(text[after]==='*')after++;
        const delimiter=text[after],stop=delimiter&&!/\s/.test(delimiter)?text.indexOf(delimiter,after+1):-1;
        if(stop>=0){output+=text.slice(at,stop+1);at=stop+1;continue;}
      }
      if(name==='begin') {
        const match=text.slice(after).match(/^\s*\{([^{}]+)\}/);
        if(match&&punctuationOpaqueEnvironments.has(match[1])) {
          const end=`\\end{${match[1]}}`,stop=text.indexOf(end,after+match[0].length);
          const finish=stop<0?text.length:stop+end.length;
          output+=text.slice(at,finish);at=finish;continue;
        }
      }
      if(punctuationOpaqueArguments.has(name)) {
        if(text[after]==='*')after++;
        let cursor=after;
        for(;;) {
          const next=cursor+(text.slice(cursor).match(/^\s*/)?.[0].length||0);
          if(text[next]!=='[')break;
          const stop=punctuationGroupEnd(text,next,'[',']');if(stop<0)break;cursor=stop;
        }
        const start=cursor+(text.slice(cursor).match(/^\s*/)?.[0].length||0);
        if(text[start]==='{') {
          const stop=punctuationGroupEnd(text,start);
          if(stop>=0){output+=text.slice(at,stop);at=stop;continue;}
        }
      }
      if(punctuationTextArguments.has(name)) {
        const start=after+(text.slice(after).match(/^\s*/)?.[0].length||0);
        if(text[start]==='{') {
          const stop=punctuationGroupEnd(text,start);
          if(stop>=0){output+=text.slice(at,start+1)+punctuationSegment(text.slice(start+1,stop-1),false)+'}';at=stop;continue;}
        }
      }
      output+=command;at=after;continue;
    }
    if(!math&&text[at]==='$') {
      const delimiter=text[at+1]==='$'?'$$':'$';
      let stop=at+delimiter.length;
      for(;(stop=text.indexOf(delimiter,stop))>=0&&text[stop-1]==='\\';stop+=delimiter.length){}
      if(stop>=0) {
        output+=delimiter+punctuationSegment(text.slice(at+delimiter.length,stop),true)+delimiter;
        at=stop+delimiter.length;continue;
      }
    }
    const char=academicPunctuation[text[at]]||text[at],next=text[at+1]||'';
    output+=char;
    if(!math&&(/[,:;!?]/.test(char)&&/[\p{L}\p{N}$]/u.test(next)||
      char==='.'&&/[\p{L}$]/u.test(next)||char===')'&&/[\u3400-\u9fff]/.test(next)))output+=' ';
    at++;
  }
  return output;
}

export function normalizeAcademicPunctuation(value,{math=false}={}) {
  return punctuationSegment(String(value??''),math);
}
export const ACADEMIC_PUNCTUATION_RULES=String.raw`展示题干、选项、答案、解析采用英文数学论文常用的ASCII标点: 顿号“、”及中文逗号用逗号 ,; 句号用 .; 冒号、分号、问号、感叹号、圆括号与方括号用对应ASCII形式. 正文标点后留合理空格, 数学逗号及其他数学标点由TeX数学模式排版, 字体字形与正文不同属于正常数学排版, 不强制变成正文字体. 坐标、区间、集合、条件及分段公式中的逗号、分号保留各自含义, 不全部改成句号. 展示填空题和解答题完整题干末尾有合理句末标点, 默认用句点 .; 选择题只在固定作答括号后加句点, 不给每个选项或数学括号添加句点; 实际问句保留问号. TeX控制符、引用键、路径与绘图代码保持语义. originalText、source_verbatim、官方档案和原件仍逐字保留; 规范展示不是漏字或改动数学条件.`;

function protectNamedSetLists(text,protectedStyles,protectedBare) {
 // A declaration may name several sets in one formula or separate inline
 // formulas. Only follow explicit list separators, never a relation's RHS:
 // “集合 $P, Q$” names Q, while “集合 $A\\subset Q$” does not.
 const name=/^(?:\\(mathbb|mathbf|mathrm|mathsf|mathit|boldsymbol)\s*(?:\{\s*([A-Z])\s*\}|([A-Z])(?![A-Za-z]))|([A-Z])(?![A-Za-z]))/;
 const opening=/^\s*(?:\$\$?|\\\(|\\\[)?\s*/;
 const separator=/^\s*(?:\$\$?|\\\)|\\\])?\s*[,，、和与及]\s*(?:\$\$?|\\\(|\\\[)?\s*/;
 for(const declaration of text.matchAll(/集合\s*/g)) {
  let rest=text.slice(declaration.index+declaration[0].length).replace(opening,'');
  for(;;) {
   const match=rest.match(name);if(!match)break;
   const letter=match[2]||match[3]||match[4];
   if(letters.includes(letter)) {
    if(match[1])protectedStyles.add(`${match[1]}:${letter}`);
    else protectedBare.add(letter);
   }
   rest=rest.slice(match[0].length);
   const next=rest.match(separator);if(!next)break;
   rest=rest.slice(next[0].length);
  }
 }
}

export function numberSetFontContext(value) {
 const text=String(value??''),protectedStyles=new Set(),protectedBare=new Set(),domainBare=new Set();
 for(const letter of letters){
  const token=String.raw`\\(mathbb|mathbf|mathrm|mathsf|mathit|boldsymbol)\s*(?:\{\s*${letter}\s*\}|${letter}(?![A-Za-z]))`;
  for(const match of text.matchAll(new RegExp(token+String.raw`\s*(?:=|\\coloneqq)`,'g')))
   protectedStyles.add(`${match[1]}:${letter}`);
  for(const match of text.matchAll(new RegExp(String.raw`(?:点|向量|矩阵|半径|参数|常数|设集合|定义集合)\s*\$?\s*`+token,'g')))
   protectedStyles.add(`${match[1]}:${letter}`);
  // An explicitly defined R/N/etc. is a named variable, set, matrix or point.
  // It must remain distinct from the standard number domain with the same letter.
  if(new RegExp(String.raw`(?<![A-Za-z\\])${letter}\s*(?:=|\\coloneqq)(?!=)`).test(text)||
   new RegExp(String.raw`(?:点|向量|矩阵|半径|参数|常数|集合)\s*\$?\s*${letter}(?![A-Za-z])`).test(text))
   protectedBare.add(letter);
  if(new RegExp(String.raw`(?:定义域|值域|实数集|自然数集|整数集|有理数集|复数集|全体实数|全体自然数|全体整数|全体有理数|全体复数)[^。;；\n]{0,20}?\$\s*${letter}\s*\$`).test(text))
   domainBare.add(letter);
 }
 protectNamedSetLists(text,protectedStyles,protectedBare);
 return {protectedStyles,protectedBare,domainBare};
}

export function normalizeNumberSetFormula(value,context=numberSetFontContext(value)) {
 const celsiusPrefix=/\^\s*(?:\\circ|\{\s*\\circ\s*\})\s*(?:(?:\\[,!;:]|\\quad|\\qquad|\\enspace|\\thinspace)\s*)*$/;
 let text=String(value??'').replace(styled,(token,style,braced,single,at,source)=>{
  const letter=braced||single;
  // A C immediately following the degree sign is a Celsius unit. It must
  // remain upright even when an earlier normalization styled it as a domain.
  if(letter==='C'&&celsiusPrefix.test(source.slice(0,at)))return '\\mathrm{C}';
  // C with both an upper and lower index is combinatorial notation, not the
  // complex number domain. The source wording and underlying indices remain.
  const script=String.raw`\s*(?:\{[^{}]*\}|[^\s{}])`;
  if(letter==='C'&&new RegExp('^\\s*(?:_'+script+'\\s*\\^'+script+'|\\^'+script+'\\s*_'+script+')').test(source.slice(at+token.length)))
   return style==='mathbb'?'C':token;
  return context.protectedStyles.has(`${style}:${letter}`)?token:`\\mathbb{${letter}}`;
 }).replace(/[ℕℚℤℝℂ]/g,symbol=>`\\mathbb{${doubleStruck[symbol]}}`);
 // Protect TeX commands and their styled/text arguments. Convert bare letters
 // only when the notation or surrounding prose identifies a number domain.
 text=text.replace(/\\(?:[A-Za-z]+|.)|[NQZRC](?![A-Za-z])/g,(token,at,source)=>{
  if(token.startsWith('\\')||/[A-Za-z]/.test(source[at-1]||''))return token;
  if(context.protectedBare?.has(token))return token;
  const prefix=source.slice(0,at);
  if(token==='C'&&celsiusPrefix.test(prefix))return '\\mathrm{C}';
  if(/\\(?:mathbb|mathbf|mathrm|mathsf|mathit|boldsymbol|text|mbox|vec|overrightarrow)\s*\{?\s*$/.test(prefix))return token;
  const relation=/\\(?:in|notin|subset|subseteq|subsetneq|supset|supseteq|supsetneq)\s*(?:\{\s*)?$/.test(prefix);
  const standalone=source.trim()===token;
  if(relation||(standalone&&context.domainBare?.has(token)))return `\\mathbb{${token}}`;
  return token;
 });
 return text;
}

export const NUMBER_SET_FONT_RULE=String.raw`自然数集、整数集、有理数集、实数集、复数集统一使用黑板粗体数集符号 \mathbb{N}、\mathbb{Z}、\mathbb{Q}、\mathbb{R}、\mathbb{C}，不使用普通斜体、正体或实心粗体代替。星号、正负号及上标保持原含义。自行定义的集合、矩阵、点或其他同名字母保持区别，不得因数集排版规则改变数学含义。数学公式中的逗号、括号、关系符号与条件分隔使用对应的规范TeX写法，不以文字引号或排版空白代替数学符号。`;

export const ANSWER_BLANK_WIDTH_EM = 3;
export const ANSWER_BLANK_TEX = String.raw`\underline{\hspace{3em}}`;
export const CHOICE_BLANK_TEXT = '(　)';
export const CHOICE_BLANK_WIDTH_EM = 1;
const emptyUnderline = /\\underline\{(?:\s|\\(?:quad|qquad|enspace|thinspace|space)\b|\\[,;! ]|\\hspace\*?\{\s*\d*\.?\d+\s*(?:em|ex|cm|mm|pt)\s*\}|[_＿﹍﹎])+\}/g;
export function normalizeAnswerBlankFormula(value) {
  return String(value ?? '').replace(emptyUnderline, () => ANSWER_BLANK_TEX);
}
export function normalizeAnswerBlanks(value) {
  // A blank alone is an inline answer slot, even if the transcription used
  // display delimiters. Handle it before tokenizing: $x=$$$blank$$ contains a
  // closing inline dollar immediately followed by the opening display pair.
  const blank=String.raw`(?:\\displaystyle\s*)?(${emptyUnderline.source})`;
  const displayBlank=new RegExp(String.raw`(?:\$\$\s*${blank}\s*\$\$|\\\[\s*${blank}\s*\\\])`,'g');
  const text=String(value??'').replace(displayBlank,()=>` $${ANSWER_BLANK_TEX}$ `)
    .replace(new RegExp(String.raw`\s*\$${ANSWER_BLANK_TEX.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\$\s*`,'g'),
      ()=>` $${ANSWER_BLANK_TEX}$ `);
  let result='',end=0;
  const append=part=>{
    // Inserting $blank$ between two existing inline tokens must not accidentally
    // manufacture a $$ display boundary. Keep those tokens separate.
    if(result.endsWith('$')&&part.startsWith('$'))result+=' ';
    result+=part;
  };
  const prose=part=>part.replace(emptyUnderline,()=>` $${ANSWER_BLANK_TEX}$ `)
    .replace(/\$[^$]*\$|(?<![\\\w])(?:_{2,}|[＿﹍﹎]{2,})(?!\w)/g, token=>token.startsWith('$')?token:` $${ANSWER_BLANK_TEX}$ `);
  for(const match of text.matchAll(mathPattern)){
    append(prose(text.slice(end,match.index)));
    const width=match[0].startsWith('$$')||match[0].startsWith('\\')?2:1;
    append(match[0].slice(0,width)+normalizeAnswerBlankFormula(match[0].slice(width,-width))+match[0].slice(-width));
    end=match.index+match[0].length;
  }
  append(prose(text.slice(end)));
  return result.replace(/(\$) +(?=[.,:;!?，；。])/g,'$1');
}
// Finalize only the complete question. Rendered paragraphs and individual
// options pass finalize:false, so a sentence mark is not added to each fragment.
export function stripQuestionPreamble(value) {
  const original=String(value??''),num=String.raw`(?:\$\s*\d+(?:\.\d+)?\s*\$|\d+(?:\.\d+)?|[零一二三四五六七八九十百]+)`,end=String.raw`\s*[,.，。;；:：]?\s*`;
  const atoms=[
    new RegExp(String.raw`^(?:(?:第\s*\d+\s*题|\d+\s*[.．、]|[一二三四五六七八九十]+[、,.．])\s*)?(?:[（(]\s*)?本(?:大|小)?题\s*(?:满分|分值)\s*${num}\s*分\s*[）)]?${end}`),
    new RegExp(String.raw`^本(?:大|小)?题\s*共(?:有)?\s*${num}\s*(?:个|道)?\s*小题${end}`),
    new RegExp(String.raw`^第\s*[（(]?\s*${num}\s*[）)]?\s*(?:小题|问)\s*(?:满分|分值|为)?\s*${num}\s*分${end}`),
    new RegExp(String.raw`^第\s*[（(]\s*${num}\s*[）)](?:\s*[,，、]\s*[（(]\s*${num}\s*[）)])+\s*小题\s*(?:满分|分值)?\s*各\s*${num}\s*分${end}`),
    new RegExp(String.raw`^每(?:一个|个|一)?\s*(?:小题|题|空)\s*(?:满分|分值)?\s*(?:均为|各为|为|各)?\s*${num}\s*分${end}`),
    /^(?:[一二三四五六七八九十]+\s*[、,.．]\s*)?(?:单项选择题|多项选择题|单选题|多选题|选择题|填空题|解答题|证明题)(?=\s*[:：（(\r\n]|\s*$)[\s:：]*/
  ];
  let text=original.trimStart(),changed=false;
  const paper=new RegExp(String.raw`^(?:考生注意\s*[:：]\s*)?(?:这份(?:试题|试卷)|本试卷|本卷|全卷)\s*共(?:有)?\s*${num}\s*(?:道大题|道试题|道题|题|大题|小题)\s*[,，]\s*(?:满分|总分)\s*${num}\s*分\s*[.。]\s*`);
  const banner=text.match(paper);
  if(banner){const rest=text.slice(banner[0].length);if(!rest.trim()||atoms.some(rx=>rx.test(rest))||/^(?:[一二三四五六七八九十]+[、,.．]|\(\d+\))/.test(rest)){text=rest;changed=true;}}
  for(let i=0;i<40;i++){
    const match=atoms.map(rx=>text.match(rx)).find(Boolean);
    if(match){text=text.slice(match[0].length).trimStart();changed=true;continue;}
    if(changed){
      const instruction=text.match(/^(?:只要求直接(?:填写|写出|填出)结果|解答应写出文字说明[、,，]证明过程或演算步骤)\s*[.。]\s*/)
        ||text.match(new RegExp(String.raw`^每(?:一个|个)?(?:小题|题)(?:都)?给出[\s\S]{0,650}?一律得\s*${num}\s*分[.。]\s*`))
        ||text.match(new RegExp(String.raw`^每(?:一个|个)?空格填对(?:得)?\s*${num}\s*分[,，]\s*否则一律得\s*${num}\s*分[.。]\s*`));
      if(instruction){text=text.slice(instruction[0].length).trimStart();continue;}
    }
    break;
  }
  if(!changed)return original;
  const part=text.match(/^[（(]\d+[）)]\s*/);
  if(part&&[...text.replace(mathPattern,'').matchAll(/[（(]\d+[）)]\s*/g)].length===1)text=text.slice(part[0].length);
  return text;
}
export function questionStemPresentation(stem,images,splitParagraphs) {
  const source=String(stem??''),text=stripQuestionPreamble(source),figures=Array.isArray(images)?images:[];
  if(text===source)return{stem:source,images:figures};
  const removed=Math.max(0,splitParagraphs(source).length-splitParagraphs(text).length);
  return{stem:text,images:figures.map(image=>Number.isInteger(image.afterParagraph)?{...image,afterParagraph:Math.max(0,image.afterParagraph-removed)}:image)};
}
export function normalizeQuestionPresentation(value,{finalize=true}={}) {
  let text=normalizeAcademicPunctuation(normalizeAnswerBlanks(stripQuestionPreamble(value))).trim();
  const spans=[...text.matchAll(mathPattern)],tail=text.search(/;\s*$/);
  if(tail>=0&&!spans.some(match=>tail>=match.index&&tail<match.index+match[0].length))text=text.slice(0,tail)+'.';
  if(!finalize||!text||/[.!?]["']*$/.test(text))return text;
  const last=spans.at(-1);
  if(last&&last.index+last[0].length===text.length) {
    const width=last[0].startsWith('$$')||last[0].startsWith('\\')?2:1;
    if(/[.!?]\s*$/.test(last[0].slice(width,-width)))return text;
  }
  return text+'.';
}
export const ANSWER_PLACEHOLDER_RULES='展示选择题用一个固定大小空括号，内宽1em，紧接题干，不用left/right放大，不带答或点线。展示填空横线统一3em；原件逐字字段仍按原卷保留原样。下标、变量名下划线和有数学内容的underline不得误改为填空。';
export const PARALLEL_RENDER_MACROS = Object.freeze({ '\\parallel': '\\mathrel{//}' });
export const PARALLEL_TEX_PREAMBLE = String.raw`\renewcommand{\parallel}{\mathrel{//}}`;
export const SOLUTION_FORMAT_RULES = String.raw`解析排版：绝对值使用明确的 \lvert ...\rvert 边界，不用普通字母竖线，不在边界内添加 \quad、\qquad 或空白占位。条件概率与整除用 \mid，不混同绝对值。分析、详解、点睛、解法等短标签使用 \textbf{...}；不写Markdown的#标题。方程组各行左对齐，使用 cases 或左列 array{l}，不使用居中列 array{c}。按原题各小问独立分段，正文完整，避免空行占位。无穷与空集符号使用正体 \infty、\emptyset，不使用斜体字形。指数、下标中的分数使用 \frac，不使用 \dfrac 或 \displaystyle 撑大脚标。结论正常写入公式，不使用 \boxed、\fbox 或方框强调答案。`+ACADEMIC_PUNCTUATION_RULES;
export const MATH_FONT_RULES='题干、选项、解析中的数学数字和表达式均使用LaTeX公式包裹，包括0、8、18等纯数值选项；不把分数之外的整数留作正文文字。题号、小问编号、年份、分值等版面元数据保留正常文本。'+NUMBER_SET_FONT_RULE+ANSWER_PLACEHOLDER_RULES+ACADEMIC_PUNCTUATION_RULES;
const mathPattern = /(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$|(?<![\\$])\$(?!\$)[^$]*?(?<!\\)\$(?!\$)|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g;
function endGroup(text, start) {
  if (text[start] !== '{') return start;
  let depth = 1;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '{') depth++;
    if (text[i] === '}' && !--depth) return i + 1;
  }
  return text.length;
}
export function isEquationSystem(formula) {
  return /\\begin\{cases\}|\\left\s*\\\{\s*\\begin\{(?:array|aligned|gathered)\}/.test(formula);
}
function compactScriptFractions(text) {
  let output = '', end = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') { i += (text.slice(i).match(/^\\(?:[A-Za-z]+|.)/)?.[0].length || 1) - 1; continue; }
    if (!'^_'.includes(text[i])) continue;
    let at = i + 1;
    while (/\s/.test(text[at] || '') && at < text.length) at++;
    if (text[at] !== '{') continue;
    const stop = endGroup(text, at);
    const body = compactScriptFractions(text.slice(at + 1, stop - 1))
      .replace(/\\(?:dfrac|tfrac)(?![A-Za-z])/g, '\\frac')
      .replace(/\\displaystyle\b\s*/g, '');
    output += text.slice(end, at + 1) + body + '}'; end = stop; i = stop - 1;
  }
  return output + text.slice(end);
}
export function unboxSolutionText(value) {
  return String(value ?? '').replace(mathPattern, token => {
    let text = token;
    // Removing the command while keeping its braces preserves nested fractions,
    // grouping and the complete answer. Only formula content is affected.
    text = text.replace(/\\(?:boxed|fbox)\s*(?=\{)/g, '');
    return text;
  });
}
export function normalizeFormula(value, numberSetContext,{punctuation=true}={}) {
  const input=punctuation?normalizeAcademicPunctuation(value,{math:true}):value;
  let text = compactScriptFractions(normalizeNumberSetFormula(normalizeAnswerBlankFormula(input), numberSetContext))
    .replace(/\\(?:varnothing|nothing)(?![A-Za-z])/g, '\\emptyset')
    .replace(/\\(?:mathit|mathsl)\s*\{\s*(\\(?:infty|emptyset)|[∞∅])\s*\}/g, '$1')
    .replace(/\\left\s*\|(?=[^|])/g, '\\left\\lvert ')
    .replace(/\\right\s*\|/g, '\\right\\rvert ')
    .replace(/\\left\s*\\vert\b/g, '\\left\\lvert ')
    .replace(/\\right\s*\\vert\b/g, '\\right\\rvert ')
    .replace(/(\\left\s*\\\{\s*\\begin\{array\}(?:\[[^\]]*\])?\s*)\{c\}/g, '$1{l}');
  const edits = []; let pending = null, depth = 0, previous = ''; const contexts = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) continue;
    if (c === '\\') {
      const command = text.slice(i).match(/^\\(?:[A-Za-z]+|.)/)[0];
      if (command === '\\{') { depth++; contexts.push({ depth, kind: 'set' }); previous = 'operator'; i++; continue; }
      if (command === '\\}') { depth--; contexts.pop(); if (pending && pending.depth > depth) pending = null; previous = 'operand'; i++; continue; }
      if (/^\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle|quad|qquad|enspace|thinspace|medspace|thickspace|[ ,;!])$/.test(command)) {
        i += command.length - 1; continue;
      }
      if (/^\\(?:text|mbox|operatorname|mathrm|begin|end)$/.test(command)) {
        let at = i + command.length;
        while (/\s/.test(text[at] || '') && at < text.length) at++;
        at = endGroup(text, at);
        if (command === '\\begin' && /\{array\}$/.test(text.slice(i, at))) {
          while (/\s/.test(text[at] || '') && at < text.length) at++;
          if (text[at] === '[') { const end = text.indexOf(']', at); if (end >= at) at = end + 1; }
          while (/\s/.test(text[at] || '') && at < text.length) at++;
          at = endGroup(text, at); // Column rules are not absolute values.
        }
        i = at - 1; previous = command === '\\begin' ? 'operator' : 'operand'; continue;
      }
      previous = /^\\(?:le|leq|ge|geq|ne|neq|in|notin|cdot|times|pm|mp|mid|colon|to|Rightarrow|Leftrightarrow|because|therefore|sin|cos|tan|cot|log|ln|exp|max|min|\\)$/.test(command) ? 'operator' : 'operand';
      i += command.length - 1; continue;
    }
    if ('({['.includes(c)) { depth++; contexts.push({ depth, kind: c === '(' && /(?:\bP|\bPr|\\mathbb\s*\{P\})\s*$/.test(text.slice(0, i)) ? 'probability' : 'group' }); previous = 'operator'; continue; }
    if (')}]'.includes(c)) { depth--; contexts.pop(); if (pending && pending.depth > depth) pending = null; previous = 'operand'; continue; }
    if (c === '|') {
      if (pending && pending.depth === depth) {
        const inside = text.slice(pending.index + 1, i);
        const ambiguousChain = pending.previous === 'operand' && /^\s*[\p{L}\p{N}]/u.test(text.slice(i + 1));
        if (inside.trim() && !/\\\\|&/.test(inside) && !ambiguousChain) {
          edits.push([pending.index, '\\lvert '], [i, '\\rvert ']);
        }
        pending = null; previous = 'absolute';
      } else if (!pending && (previous !== 'operand' || !['set','probability'].includes(contexts.at(-1)?.kind))) {
        pending = { index: i, depth, previous }; previous = 'operator';
      } else previous = 'operator'; // a|b, P(A|B), and set conditions keep their meaning.
      continue;
    }
    previous = /[=+\-<>:,;!^_\/]/.test(c) ? 'operator' : 'operand';
  }
  for (const [at, replacement] of edits.reverse()) text = text.slice(0, at) + replacement + text.slice(at + 1);
  return text;
}
export function normalizeMathText(value, context=numberSetFontContext(value),{punctuation=true}={}) {
  const input=punctuation?normalizeAcademicPunctuation(value):value;
  return normalizeAnswerBlanks(input).replace(mathPattern, token => {
    const width = token.startsWith('$$') || token.startsWith('\\') ? 2 : 1;
    return token.slice(0, width) + normalizeFormula(token.slice(width, -width),context,{punctuation}) + token.slice(-width);
  });
}
export function emphasizeSolutionLabels(value) {
  const label = /^(?:\[(?:分析|详解|解答|解|证明|点睛|点评|思路|解法[一二三四五六七八九十\d]+)\]|【(?:分析|详解|解答|解|证明|点睛|点评|思路|解法[一二三四五六七八九十\d]+)】|(?:分析|详解|解答|证明|点睛|点评|思路|解法[一二三四五六七八九十\d]+)[:：])/;
  const text = unboxSolutionText(value), spans = [...text.matchAll(mathPattern)].map(m => [m.index, m.index + m[0].length]);
  let out = '', end = 0;
  for (let i = 0; i < text.length; i++) {
    const span = spans.find(([a]) => a === i);
    if (span) { i = span[1] - 1; continue; }
    if (text[i] === '\\') {
      const styled = text.slice(i).match(/^\\(?:textbf|textit|emph)\s*\{/);
      if (styled) { i = endGroup(text, i + styled[0].length - 1) - 1; continue; }
    }
    if (i && !/[\n\s.。;；)）]/.test(text[i - 1])) continue;
    const match = text.slice(i).match(label);
    if (!match) continue;
    out += text.slice(end, i) + `\\textbf{${match[0]}}`; end = i + match[0].length; i = end - 1;
  }
  return out + text.slice(end);
}
export function leftAlignedSystemsForTex(value) {
  return value.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (token, a, b) =>
    isEquationSystem(a ?? b) ? `\n\\par\\noindent\\(\\displaystyle ${a ?? b}\\)\\par\n` : token);
}
export function alignRenderedSystems(root) {
  for (const display of root.querySelectorAll('.katex-display')) {
    const source = display.querySelector('annotation[encoding="application/x-tex"]')?.textContent || '';
    if (isEquationSystem(source)) display.classList.add('equation-system');
  }
}
