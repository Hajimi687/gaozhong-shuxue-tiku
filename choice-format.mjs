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
function choiceStemEnding(value) {
  let text=String(value).trimEnd(), previous;
  do {
    previous=text;
    text=stripAnswerMarker(text);
    // Only an entire final math token containing an empty answer parenthesis.
    // A formula such as f(0), or a nonempty mathematical interval, stays intact.
    const final=text.match(/(?:\$([^$\n]+)\$|\\\(([^\n]+?)\\\))\s*[.。]?$/u);
    if(final){
      const body=(final[1]||final[2]).trim();
      const empty=String.raw`(?:\\(?:left|bigl|Bigl)\s*)?\((?:\s|\\(?:quad|qquad|enspace|thinspace)\b|\\hspace\*?\{[^{}]*\})*(?:\\(?:right|bigr|Bigr)\s*)?\)`;
      if(new RegExp('^(?:\\\\displaystyle\\s*)?'+empty+'$','u').test(body))text=text.slice(0,final.index).trimEnd();
      else{
        // A printed answer slot can be inside the last formula, after = or ∈.
        // Move that slot out of math before appending the shared fixed blank.
        const embedded=body.match(new RegExp('^([\\s\\S]*(?:=|\\\\(?:in|notin|ne|neq)))\\s*'+empty+'$','u'));
        if(embedded){
          const token=final[1]!==undefined?'$'+embedded[1].trimEnd()+'$':'\\('+embedded[1].trimEnd()+'\\)';
          text=text.slice(0,final.index)+token;
        }
      }
    }
    text=text
      .replace(/(?:[（(][\s\u3000]*[）)]|\\(?:hfill|quad|qquad|enspace)\b|\\hspace\*?\{[^{}]*\}|[.…·]{2,}|\s)+[.。]?$/u,'').trimEnd();
  }while(text!==previous);
  return text.trim() ? text.replace(/[.。]$/u,'')+CHOICE_BLANK_TEXT : '';
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
