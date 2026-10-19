import { splitLatexParagraphs } from './latex-structures.mjs';
import { CHOICE_BLANK_TEXT, CHOICE_BLANK_WIDTH_EM } from './math-presentation.mjs';

// Recognize printed option labels only outside math. Presentation may normalize
// A./A．/(A), while the independent original transcription stays unchanged.
export function splitChoiceOptions(value) {
  const text=String(value??'');
  const markers=choiceMarkers(text);
  if(markers.length!==4||markers.map(m=>m[1]||m[2]||m[3]).join('')!=='ABCD')return null;
  // A source may use right-alignment glue or a tab before the answer blank.
  // Keep only that final empty answer bracket directly after the stem text.
  const intro=choiceStemEnding(text.slice(0,markers[0].index));
  const options=markers.map((marker,index)=>{
    let content=text.slice(marker.index+marker[0].length,index+1<markers.length?markers[index+1].index:text.length)
      .trim().replace(/\\quad\s*$/,'').trimEnd();
    if(index===markers.length-1)content=stripAnswerMarker(content);
    return {label:String.fromCharCode(65+index),content};
  });
  return {intro,options};
}

function stripAnswerMarker(value) {
  // Imported originals sometimes have a broken [答( )] bracket at the end.
  // Remove only this printed answer marker, never a mathematical option.
  return String(value).replace(/\s*(?:\[|【)\s*答\s*(?:\]|】)?\s*(?:[（(][\s\u3000]*[）)])?\s*(?:\]|】)?\s*[.。]?\s*$/u,'').trimEnd();
}
function emptyAnswerParenthesis(value,{requireSpacing=false}={}) {
  let body=String(value).trim().replace(/^\\displaystyle\s*/u,'')
    .replace(/^(?:\\(?:left|bigl|Bigl)\s*)?\(/u,'(')
    .replace(/(?:\\(?:right|bigr|Bigr)\s*)?\)$/u,')');
  if(!body.startsWith('(')||!body.endsWith(')'))return false;
  body=body.slice(1,-1);
  if(requireSpacing&&!/\s|\\(?:hspace|quad|qquad|enspace|thinspace)\b/u.test(body))return false;
  body=body.replace(/\\hspace\*?\{[^{}]*\}|\\(?:quad|qquad|enspace|thinspace)\b/gu,'');
  // Grouped spacing is still empty, but an unbalanced group or any actual
  // mathematical content must never be treated as an answer slot.
  let depth=0;
  for(const character of body){
    if(character==='{')depth++;
    else if(character==='}'){if(--depth<0)return false;}
    else if(!/\s/u.test(character))return false;
  }
  return depth===0;
}
function emptyPrintedSlot(value) {
  if(/^[（(][\s\u3000]*[）)]$/u.test(value))return true;
  const token=value.match(/^\$([^$\n]+)\$$|^\\\(([^\n]+?)\\\)$/u);
  return Boolean(token&&emptyAnswerParenthesis(token[1]||token[2]));
}
function terminalMathAnswerPrefix(value) {
  // A printed slot may directly follow a point/line name, as in AC(hspace).
  // Inspect only top-level parentheses: an empty nested group is still part
  // of its enclosing formula, and an unspaced function call such as f() stays.
  let braces=0,fences=0;
  for(let at=0;at<value.length;at++){
    const character=value[at];
    if(character==='\\'){
      at+=(value.slice(at).match(/^\\(?:[A-Za-z]+|.)/u)?.[0].length||1)-1;
      continue;
    }
    if(character==='{')braces++;
    else if(character==='}'){if(--braces<0)return null;}
    else if(!braces&&character==='('){
      if(!fences){
        const prefix=value.slice(0,at),size=prefix.match(/\\(?:left|bigl|Bigl)\s*$/u);
        const start=at-(size?.[0].length||0),slot=value.slice(start);
        if(emptyAnswerParenthesis(slot,{requireSpacing:true}))
          return value.slice(0,start).trimEnd();
      }
      fences++;
    }else if(!braces&&character==='[')fences++;
    else if(!braces&&')]'.includes(character)){if(--fences<0)return null;}
  }
  return null;
}
function choiceStemEnding(value) {
  let text=String(value).trimEnd(), previous;
  let terminal=/[?？]\s*$/u.test(text)?'?':/[!！]\s*$/u.test(text)?'!':'.';
  do {
    previous=text;
    text=stripAnswerMarker(text);
    // This source asks for the count of perpendicular occurrences. Preserve
    // that meaning while moving its one answer slot to the common position.
    const count=text.match(/能够相互垂直\s*(\$[^$\n]+\$|\\\([^\n]+?\\\)|[（(][\s\u3000]*[）)])\s*次\s*[.。]?$/u);
    if(count&&emptyPrintedSlot(count[1]))text=text.slice(0,count.index)+'能够相互垂直的次数为';
    // Only an entire final math token containing an empty answer parenthesis.
    // A formula such as f(0), or a nonempty mathematical interval, stays intact.
    const final=text.match(/(?:\$([^$\n]+)\$|\\\(([^\n]+?)\\\))\s*[.。!?？！;；]?$/u);
    if(final){
      const body=(final[1]||final[2]).trim();
      if(emptyAnswerParenthesis(body))text=text.slice(0,final.index).trimEnd();
      else{
        // A printed answer slot can be inside the last formula, after =, ∈,
        // or the final mathematical name. Keep every nonempty suffix intact.
        // Move that slot out of math before appending the shared fixed blank.
        const embedded=body.match(/^([\s\S]*(?:=|\\(?:in|notin|ne|neq)))\s*([\s\S]+)$/u);
        const prefix=embedded&&emptyAnswerParenthesis(embedded[2])
          ? embedded[1].trimEnd() : terminalMathAnswerPrefix(body);
        if(prefix!==null){
          const token=final[1]!==undefined?'$'+prefix+'$':'\\('+prefix+'\\)';
          text=text.slice(0,final.index)+token;
        }
      }
    }
    text=text
      .replace(/(?:[（(][\s\u3000]*[）)]|\\(?:hfill|quad|qquad|enspace)\b|\\hspace\*?\{[^{}]*\}|[.…·]{2,}|\s)+[.。!?？！;；]?$/u,'').trimEnd();
  }while(text!==previous);
  if(terminal==='.')terminal=/[?？]\s*$/u.test(text)?'?':/[!！]\s*$/u.test(text)?'!':'.';
  return text.trim() ? text.replace(/[.。!?？！;；]$/u,'')+CHOICE_BLANK_TEXT+terminal : '';
}

export function choiceBlanksForTex(value) {
  return String(value??'').replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\(　\)/g,
    token=>token===CHOICE_BLANK_TEXT?`\\mbox{(\\hspace{${CHOICE_BLANK_WIDTH_EM}em})}`:token);
}
export function choiceBlanksHtml(escapedText) {
  return String(escapedText).replaceAll(CHOICE_BLANK_TEXT,'<span class="choice-answer-blank" aria-label="作答括号" style="display:inline-flex;white-space:nowrap;font-family:KaTeX_Main,serif;font-size:1em;font-style:normal">(<span class="choice-answer-space" style="display:inline-block;width:1em"></span>)</span>');
}

function choiceMarkers(text) {
  const masked=text.replace(/\$\$[\s\S]*?\$\$|(?<!\$)\$[^$\r\n]*\$(?!\$)|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g,
    match=>' '.repeat(match.length));
  return [...masked.matchAll(/\(([A-D])\)|（([A-D])）|(?:^|(?<=\s))([A-D])[.．、:：]/gm)];
}

export function formatChoiceLabels(value) {
  const parts=splitChoiceOptions(value);
  return parts?(parts.intro?parts.intro+'\n\n':'')+parts.options.map(option=>`(${option.label}) ${option.content}`).join('\n'):String(value??'');
}

// Only call this for a choice question's answer field. C is an option letter
// here; an actual complex number domain in another field retains mathbb{C}.
export function formatChoiceAnswer(value) {
  const text=String(value??'').trim();
  const body=text.replace(/^\$([^$]*)\$$/,'$1').replace(/^\\\(([\s\S]*)\\\)$/,'$1').trim();
  const match=body.match(/^(?:[（(]\s*)?(?:\\(?:mathbb|mathrm|mathbf|mathit|mathsf)\s*\{\s*([A-D])\s*\}|([A-D]))(?:\s*[）)])?[.。]?$/u);
  return match?`$${match[1]||match[2]}$`:String(value??'');
}

// Normalize the complete stem before splitting it. Source image positions refer
// to its original paragraphs; map those boundaries into the displayed stem.
// An image between options creates a paragraph boundary there, while ordinary
// option blocks stay together for the shared option layout.
export function choiceStemPresentation(value, formatter=formatChoiceLabels, images=[]) {
  const source=String(value??'').trim();
  let stem=formatter(source);
  const original=splitLatexParagraphs(source);
  const rawMarkers=choiceMarkers(source), markers=choiceMarkers(stem);
  const valid=splitChoiceOptions(source)&&splitChoiceOptions(stem);
  // Earlier intake normalized four separately pictured options into one text
  // paragraph, retaining their five original paragraph boundaries in assets.
  // Restore those explicit A/B/C/D boundaries only for this unambiguous shape.
  if(valid&&original.length===2&&images.length===4&&images.every((image,index)=>image.afterParagraph===index+2)){
    const parts=splitChoiceOptions(stem);
    return {stem:parts.intro+'\n\n'+parts.options.map(option=>`(${option.label}) ${option.content}`).join('\n\n'),images:images.map(image=>({...image}))};
  }
  const boundaries=[];
  let cursor=0;
  for(const paragraph of original){
    const start=source.indexOf(paragraph,cursor), end=start+paragraph.length;
    cursor=end;
    if(!valid){
      const count=splitLatexParagraphs(formatter(source.slice(0,end))).length;
      let offset=0;
      for(const part of splitLatexParagraphs(stem).slice(0,count))offset=stem.indexOf(part,offset)+part.length;
      boundaries.push(offset);
      continue;
    }
    const segment=rawMarkers.findLastIndex(marker=>marker.index<end);
    const rawStart=segment<0?0:rawMarkers[segment].index;
    const next=segment<0?0:segment+1;
    const targetStart=segment<0?0:markers[segment].index;
    const targetEnd=markers[next]?.index??stem.length;
    const target=stem.slice(targetStart,targetEnd).trimEnd();
    const rawPrefix=source.slice(rawStart,end);
    const prefix=segment<0?choiceStemEnding(rawPrefix):stripAnswerMarker(rawPrefix);
    const count=splitLatexParagraphs(formatter(prefix)).length;
    const paragraphs=splitLatexParagraphs(target);
    if(!count){boundaries.push(targetStart);continue;}
    let offset=0;
    for(const part of paragraphs.slice(0,count)) offset=target.indexOf(part,offset)+part.length;
    boundaries.push(targetStart+offset);
  }
  if(boundaries.length)boundaries[boundaries.length-1]=stem.length;
  const requested=new Set(images.filter(image=>Number.isInteger(image.afterParagraph)&&image.afterParagraph>0&&image.afterParagraph<original.length)
    .map(image=>boundaries[image.afterParagraph-1]));
  // Work backwards so recorded offsets continue to refer to the original output.
  const insertions=[...requested].filter(offset=>offset>0&&offset<stem.length&&
    !/^\s*\n\s*\n/.test(stem.slice(offset))).sort((a,b)=>b-a);
  for(const offset of insertions)stem=stem.slice(0,offset)+'\n\n'+stem.slice(offset);
  const shift=offset=>offset+insertions.filter(at=>at<offset).length*2;
  const total=splitLatexParagraphs(stem).length;
  const positions=[0,...boundaries.map(offset=>splitLatexParagraphs(stem.slice(0,shift(offset))).length)];
  return {stem,images:images.map(image=>({...image,afterParagraph:Number.isInteger(image.afterParagraph)&&image.afterParagraph>=0&&image.afterParagraph<original.length
    ? positions[image.afterParagraph] : total}))};
}
