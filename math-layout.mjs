import {splitChoiceOptions} from './choice-format.mjs';

// Tall formulas take part in each row's layout. A newline is never an option box.
export const MATH_LAYOUT_CSS=String.raw`
.choice-answer-blank{display:inline-flex;align-items:baseline;white-space:nowrap;font-family:"KaTeX_Main","Times New Roman",serif;font-size:1em;font-style:normal;vertical-align:baseline}
.choice-answer-space{display:inline-block;flex:none;width:1em}
.choice-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55em 1.6em;margin:.65em 0 .3em;white-space:normal}
.choice-options.choice-long,.choice-options.choice-fit-single{grid-template-columns:minmax(0,1fr)}
.choice-option{display:flex;align-items:center;gap:.45em;min-width:0;min-height:2.1em;line-height:var(--math-prose-leading,1.75);break-inside:avoid}
.choice-label{flex:none;white-space:nowrap}.choice-content{flex:1 1 0;min-width:0;max-width:100%;overflow-wrap:anywhere;overflow:visible;padding:.14em 0}
.choice-content.choice-content-overflow{overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain}
.math-expression-scroll{display:inline-block;max-width:100%;overflow-x:auto;overflow-y:hidden;vertical-align:middle;overscroll-behavior-x:contain;padding:.16em 0;box-sizing:border-box}
.math-expression-scroll>.katex{display:inline-block}
.card-stem,.stem-paragraph,.math-prose-row{padding-inline-end:.2em;box-sizing:border-box}
.choice-content .katex,.math-prose-row:not(.math-display-row) .katex{display:inline-block;vertical-align:middle;padding:.08em 0;white-space:nowrap}
.math-prose{display:grid;gap:var(--math-prose-gap,.24em);min-width:0;white-space:normal}
.math-prose-row{min-width:0;line-height:var(--math-prose-leading,1.75);white-space:normal;overflow-wrap:anywhere}
.math-prose-row>.math-content{white-space:normal;line-height:inherit}
.math-prose .math-display-row{line-height:normal}
.math-prose .katex-display{margin:var(--math-display-gap,.12em) 0;padding:0;max-width:100%}
.katex-display{max-width:100%;overflow-x:auto;overscroll-behavior-x:contain}
.math-prose .katex-display.equation-system,.math-prose .katex-display.equation-system>.katex{text-align:left}
@media(max-width:620px){.choice-options{grid-template-columns:minmax(0,1fr)}}
`;

const widths=new WeakMap();
const watched=new Set();
let observer;
function choiceOverflows(content){
 const edge=content.getBoundingClientRect().right;
 return content.scrollWidth>content.clientWidth+1||[...content.querySelectorAll('.katex-html')].some(math=>math.getBoundingClientRect().right>edge+1);
}
function fitChoices(grid){
 if(!grid.isConnected||!grid.clientWidth)return;
 const contents=[...grid.querySelectorAll('.choice-content')];
 for(const content of contents)content.classList.remove('choice-content-overflow');
 grid.classList.remove('choice-fit-single');
 if(!grid.classList.contains('choice-long')&&getComputedStyle(grid).gridTemplateColumns.split(' ').length>1&&
   contents.some(choiceOverflows))
  grid.classList.add('choice-fit-single');
 // A fitting fraction needs its natural height and the whole option column.
 // Enable horizontal scrolling only after the full-row fallback still cannot fit.
 for(const content of contents)content.classList.toggle('choice-content-overflow',choiceOverflows(content));
}
function fitDisplay(block){
 if(block.isConnected&&block.clientWidth){
  const fits=block.scrollWidth<=block.clientWidth+1;
  block.classList.toggle('math-display-fits',fits);
  block.style.overflowX=fits?'visible':'';
  block.style.overflowY=fits?'visible':'';
 }
}
// Source character counts cannot predict TeX widths. Measure after KaTeX and
// fonts are ready; observe only width changes so taller formulas never cause a
// resize loop or another rendering pass.
export function adaptMathLayout(root){
 if(typeof window==='undefined')return;
 const grids=[...root.querySelectorAll('.choice-options')];
 const displays=[...root.querySelectorAll('.katex-display')].filter(block=>!block.closest('.choice-content,.math-expression-scroll'));
 if(!observer&&typeof ResizeObserver!=='undefined')observer=new ResizeObserver(entries=>{
  for(const {target,contentRect} of entries){
   const width=contentRect.width;
   if(widths.get(target)===width)continue;
   widths.set(target,width);
   if(target.classList.contains('choice-options'))fitChoices(target);else fitDisplay(target);
  }
 });
 for(const grid of watched)if(!grid.isConnected){observer?.unobserve(grid);watched.delete(grid);}
 for(const grid of grids){fitChoices(grid);observer?.observe(grid);watched.add(grid);}
 for(const block of displays){fitDisplay(block);observer?.observe(block);watched.add(block);}
 const wrapWide=()=>{
  for(const math of root.querySelectorAll('.katex')){
   if(math.closest('.choice-content,.math-expression-scroll')||math.parentElement.classList.contains('katex-display'))continue;
   let parent=math.parentElement;
   // Auto-render wraps inline math in an ordinary span, whose clientWidth is
   // zero. Measure its containing text row instead of skipping that formula.
   while(parent&&!parent.clientWidth)parent=parent.parentElement;
   if(!parent)continue;
   if(!parent.clientWidth||math.getBoundingClientRect().width<=parent.clientWidth+1)continue;
   const wrapper=document.createElement('span');wrapper.className='math-expression-scroll';
   wrapper.tabIndex=0;wrapper.setAttribute('aria-label','长公式，可左右滚动查看');
   math.before(wrapper);wrapper.append(math);
  }
  for(const grid of grids)fitChoices(grid);
  for(const block of displays)fitDisplay(block);
 };
 wrapWide();
 document.fonts?.ready.then(()=>{if(root.isConnected)wrapWide();});
}

export function renderChoiceOptionsHtml(value,renderText,escape){
 const parts=splitChoiceOptions(value);if(!parts)return null;
 const long=parts.options.some(option=>option.content.replace(/\$[^$]*\$/g,'xxxxxxxx').length>38||/\$[^$]{80,}\$|\$\$/.test(option.content));
 return (parts.intro?`<div class="choice-stem">${renderText(parts.intro)}</div>`:'')+
  `<div class="choice-options${long?' choice-long':''}">`+parts.options.map(option=>
   `<div class="choice-option"><span class="choice-label">(${escape(option.label)})</span><div class="choice-content">${renderText(option.content)}</div></div>`).join('')+'</div>';
}

// Keep inline math and environments intact while removing newline-only spacing
// above/below display equations. Source text and formulas stay untouched.
export function renderMathProse(value,renderText){
 const source=String(value??'').trim(),rows=[];let current='',end=0;
 const flush=()=>{if(current.trim())rows.push({content:current.trim(),display:false});current='';};
 const append=text=>{const lines=text.split(/\r?\n+/);lines.forEach((line,index)=>{if(index)flush();current+=line;});};
 const protectedTokens=/(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$|(?<![\\$])\$(?!\$)[^$]*?(?<!\\)\$(?!\$)|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}/g;
 for(const token of source.matchAll(protectedTokens)){
  append(source.slice(end,token.index));
  if(token[0].startsWith('$$')||token[0].startsWith('\\[')){flush();rows.push({content:token[0],display:true});}
  else current+=token[0];
  end=token.index+token[0].length;
 }
 append(source.slice(end));flush();
 const combined=[];
 for(const row of rows){
  const previous=combined.at(-1);
  if(previous&&!row.display&&/^[.,;:!?，。；：！？]+$/.test(row.content)){
   if(previous.display){
    const closing=previous.content.endsWith('$$')?'$$':'\\]';
    previous.content=previous.content.slice(0,-closing.length)+row.content+closing;
   }else previous.content+=row.content;
  }else combined.push({...row});
 }
 return '<div class="math-prose">'+combined.map(row=>`<div class="math-prose-row${row.display?' math-display-row':''}">${renderText(row.content)}</div>`).join('')+'</div>';
}
